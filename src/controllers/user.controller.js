import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"

const generateRefreshAndAccessTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const refreshToken = user.generateRefreshToken()
        const accessToken = user.generateAccessToken()
    
        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })
    
        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating Access and Refresh Tokens")
    }
}

const registerUser = asyncHandler( async (req, res) => {
    // 1. Validate incoming request data (e.g., username, email, password)
    // 2. Check if a user already exists (same email or username)
    // 3. Check for images, check for avatar. Upload to cloudinary
    // 4. Create user object - create entry in db
    // 5. Generate authentication tokens (access & refresh)
    // 6. Remove password and refresh token field from response
    // 7. Check for user creation
    // 8. return res

    // 1. Validate incoming request data (e.g., username, email, password)
    if(!req.body){
        throw new ApiError(400, "Request body required!")
    }

    const { username, fullName, email, password } = req.body;
    // console.log("email: ", email);

    if ([username, email, fullName, password].some((field) => !field || field?.trim() === "")){
        throw new ApiError(400, "All field are required!")
    }

    // 2. Check if a user already exists (same email or username)
    const userExists = await User.findOne({
        $or: [{email}, {username}]
    })
    // console.log("userExists: ", userExists)
    if(userExists){
        throw new ApiError(409, "User with same email or username already exists");
    }

    // 3. Check for images, check for avatar. Upload to cloudinary

    // Like req.body, multer provides access to req.files()
    const avatarLocalFilePath = req.files?.avatar[0]?.path;

    // This gives error because unlike avatar we do not check coverImageLocalFilepath explicitly. Here 
    // even if req.files exist, we are accessing 0th element of coverImage array, and if that exists we access path
    // However, what if coverImage array only not exists, then accessing its 0th element gives error
    //& const coverImageLocalFilePath = req.files?.coverImage[0]?.path;

    let coverImageLocalFilePath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
        coverImageLocalFilePath = req.files.coverImage[0].path;
    }

    // console.log("req.files: ", req.files)

    if(!avatarLocalFilePath){
        throw new ApiError(400, "Avatar File is required!")
    }

    const avatar = await uploadOnCloudinary(avatarLocalFilePath)
    const coverImage = await uploadOnCloudinary(coverImageLocalFilePath)

    if(!avatar){
        throw new ApiError(400, "Avatar File is required!")
    }

    // 4. Create user object - create entry in db

    // User.create() creates a new entry in db
    const user = await User.create({
        username: username.toLowerCase(), 
        fullName,
        email,
        password,
        avatar: avatar.url, 
        coverImage: coverImage?.url || "", // We never checked coverImage existed or not, therefore we check here
    })

    // 5. Generate authentication tokens (access & refresh)


    // 6. Remove password and refresh token field from response
    // .select() removes the fields that are selected. weird syntax
    const createdUser = await User.findById(user?._id).select(
        "-password -refreshToken"
    )

    // 7. Check for user creation
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    // 8. return res
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully!")
    )
})

const loginUser = asyncHandler( async (req, res) => {
    // 1. Validate User fields
    // 2. Check login details (username/email & password) 
    // 3. Generate access and refresh token
    // 4. return cookies
    // 5. success or error return

    // 1. Validate User fields
    const { email, username, password } = req.body;

    if((!email && !username) || !password){
        throw new ApiError(400, "Enter all fields")
    }

    const user = await User.findOne({
        $or: [{email}, {username}]
    })

    // 2. Check login details (username/email & password) 
    if(!user){
        throw new ApiError(401, "Invalid user credentials")
    }
    console.log("User: ", user)

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials")
    }

    // 3. Generate access and refresh token
    const {accessToken, refreshToken} = await generateRefreshAndAccessTokens(user._id)

    // 4. return cookies
    // 5. success or error return
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
        new ApiResponse(200, {
            user: loggedInUser, accessToken, refreshToken,
        },
        "Logged In Successfully!"
    )
    )
})

const logoutUser = asyncHandler ( async(req, res) => {
    await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                refreshToken: undefined,
            }
        },
        {
            new: true,
        }
    )

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res.
    status(200).
    clearCookie("accessToken", options).
    clearCookie("refreshToken", options).
    json(new ApiResponse(200, {}, "User Logged out successfully!"))
})

const refreshAccessToken = asyncHandler( async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.ACCESS_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken._id)
    
        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh Token is expired or used")
        }
    
        const {accessToken, newRefreshToken} = await generateRefreshAndAccessTokens(user._id)
    
        if(!accessToken){
            throw new ApiError(500, "Access token could not be generated")
        }
    
        let options = {
            httpOnly: true,
            secure: true
        }
    
        return res.
        status(200).
        cookie('accessToken', accessToken, options).
        cookie('refreshToken', newRefreshToken, options).
        json(new ApiResponse(200, {accessToken, refreshToken: newRefreshToken}, "Access Token refreshed successfully"))
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Refresh Token")
    }
})

export { registerUser, loginUser, logoutUser, refreshAccessToken }