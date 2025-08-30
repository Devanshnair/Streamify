import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler( async (req, res) => {
    // 1. Validate incoming request data (e.g., username, email, password)
    // 2. Check if a user already exists (same email or username)
    // 3. Check for images, check for avatar. Upload to cloudinary
    // 4. Create user object - create entry in db
    // 5. Generate authentication tokens (access & refresh)
    // 6. Remove password and refresh token field from response
    // 7. Check for user creation
    // 8. return res

    const { username, fullName, email, password } = req.body;
    console.log("email: ", email);

    // 1. Validate incoming request data (e.g., username, email, password)
    if ([username, email, fullName, password].some((field) => field?.trim() === "")){
        throw new ApiError(400, "All field are required!")
    }

    // 2. Check if a user already exists (same email or username)
    const userExists = User.findOne({
        $or: [{email}, {username}]
    })
    console.log("userExists: ", userExists)
    if(userExists){
        throw new ApiError(409, "User with same email or username already exists");
    }

    // 3. Check for images, check for avatar. Upload to cloudinary

    // Like req.body, multer provides access to req.files()
    const avatarLocalFilePath = req.files?.avatar[0]?.path;
    const coverImageLocalFilePath = req.files?.coverImage[0]?.path;
    console.log("req.files: ", req.files)

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


export { registerUser }