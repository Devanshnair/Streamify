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
        throw new ApiError(400, "Error while uploading avatar!")
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
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
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

const changeCurrentPassword = asyncHandler( async (req, res) => {
    const { oldPassword, newPassword } = req.body

    const user = await User.findById(req.user?._id)

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(40, "Incorrect old password!")
    }

    user.password = newPassword;
    const userSaved = await user.save({validateBeforeSave: false});
    console.log(userSaved)

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully!"))
})

const getCurrentUser = asyncHandler( async (req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully!"))
})

const updateAccountDetails = asyncHandler( async (req, res) => {
    const { fullName, email } = req.body

    if(!fullName || !email){
        throw new ApiError(400, "All fields required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email,
            }
        },
        {
            new: true
        }
    ).select("-password -refreshToken")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully!"));
})


//TODO create 'deleteFromCloudinary' utility function and delete previous avatar and cover image from cloudinary during updation
const updateUserAvatar = asyncHandler( async (req, res) => {
    const avatarLocalFilePath = req.file?.path

    if(!avatarLocalFilePath){
        throw new ApiError(400, "Avatar File Missing!")
    }

    const avatar = await uploadOnCloudinary(avatarLocalFilePath)

    if(!avatar.url){
        throw new ApiError(400, "Error while uploading avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url,
            }
        },
        { 
            new: true,
        }
    ).select("-password -refreshToken")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully!"))
})

const updateUserCoverImage = asyncHandler( async (req, res) => {
    const coverImageLocalFilePath = req.file?.path

    if(!coverImageLocalFilePath){
        throw new ApiError(400, "coverImage File Missing!")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalFilePath)

    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading coverImage")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url,
            }
        },
        { 
            new: true,
        }
    ).select("-password -refreshToken")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover Image updated successfully!"))
})

const getUserChannelProfile = asyncHandler( async (req, res) => {
    const { username } = req.params

    if(!username){
        throw new ApiError(400, "Username is missing")
    }

    const channel = await User.aggregate([
        // Out of all User documents, you filter out single user document whose username matches.
        //& Sample Output:   
        //& {
        //&     _id: ObjectId("johndoe_id"),
        //&     username: "johndoe",
        //&     fullName: "John Doe",
        //&     email: "john@example.com",
        //&     ..... other fields
        //& }
        {
            $match: {
                username: username?.toLowerCase(), 
            }
        },

        //^ (Please note that subscriber & channel both store ObjectId which are references to User schema.
        //^ However, they do not store the entire schema of user (username, email etc.) just a single ObjectId 
        //^ similar to _id. It is said to be referenced because this ObjectId matches an exist user document _id.
        //^ For e.g. a subscription document may look like 
        //^ { _id: ObjectId("abc123"), subscriber: ObjectId("user1_id"), channel: ObjectId("user2_id"), createdAt: ISODate("...") }
        //^ similar case in channel.)

        // In subscriptions, you filter out all documents having channel matching with _id. Each stage returns
        // an array of results. Here we get an array field called 'subscribers : []' attached to other 
        // user details. 
        //& Sample Output:   
        //& {
        //&     _id: ObjectId("johndoe_id"),
        //&     username: "johndoe",
        //&     fullName: "John Doe",
        //&     email: "john@example.com",
        //&     ..... other fields
        //&     subscribers: [  // ← NEW FIELD ADDED (array of subscription documents)
        //&         {
        //&             _id: ObjectId("sub1"),
        //&             subscriber: ObjectId("alice_id"),
        //&             channel: ObjectId("johndoe_id"),
        //&             createdAt: "..."
        //&         },
        //&         {},
        //&         {},
        //&     ]
        //& }
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers",
            }
        },

        // In subscriptions, you filter out all documents having subscriber matching with _id. 
        // We get an array field called 'subscribedTo : []' attached to other user details and subscribed: [] 
        //& Sample Output:   
        //& {
        //&     _id: ObjectId("johndoe_id"),
        //&     username: "johndoe",
        //&     fullName: "John Doe",
        //&     email: "john@example.com",
        //&     ..... other fields
        //&     subscribers: [ {}, {}, {} ],
        //&     subscribedTo: [  // ← NEW FIELD ADDED (channels johndoe subscribed to)
        //&         {
        //&             _id: ObjectId("sub10"),
        //&             subscriber: ObjectId("johndoe_id"),
        //&             channel: ObjectId("tech_channel_id"),
        //&             createdAt: "..."
        //&         },
        //&         {},
        //&         {},
        //&     ]
        //& }
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo",
            }
        },

        // Here, the array subscribers and subscribedTo are replaced with the count, 
        // because we use the same name. If we were to use different names like 
        // 'subscriberCount' and 'channelsSucbscribedTo' then we would have previous arrays as well as new fields
        {
            $addFields: {
                subscribers: {
                    $size: "$subscribers" 
                },
                subscribedTo: {
                    $size: "$subscribedTo" 
                },
                isSubscribed: {
                    $cond: {
                        // $in finds whether value exists in array/objects (both possible)
                        // What this does is, it creates an array of only subscriber ids and searches in that
                        //     From --->
                        //     [  // From stage 2 (3 subscription docs)
                        //         { _id: ObjectId("sub1"), subscriber: ObjectId("alice_id"), channel: ObjectId("johndoe_id") },
                        //         { _id: ObjectId("sub2"), subscriber: ObjectId("bob_id"), channel: ObjectId("johndoe_id") },
                        //         { _id: ObjectId("sub3"), subscriber: ObjectId("charlie_id"), channel: ObjectId("johndoe_id") }
                        //     ],
                        //     To --->
                        //&    [ObjectId("alice_id"), ObjectId("bob_id"), ...]
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] }, 
                        then: true,
                        else: false,
                    }
                }
            }
        },
        // $project simply used to specify what fields are to be shown finally in final result, 
        // basically to remove unnecessary fields
        {
            $project: {
                username: 1,
                fullName: 1,
                email: 1,
                subscribers: 1,
                subscribedTo: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
            }
        }
    ])
    console.log("Channel: ", channel);

    if(!channel?.length){
        throw new ApiError(404, "Channel does not exist")
    }

    return res
    .status(200)
    .json(new ApiResponse(200, channel[0], "Channel details fetched succesfully!"))
}) 

const getWatchHistory = asyncHandler( async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                // Very Important! 
                // req.user._id comes from my own auth middleware, which fetches from mongodb and inserts
                // So, its type is ObjectId. However, if id were to received from let's say params/queries
                // we will get id of type String. Now, in mongoDB calls, like findbyId() etc. it accepts both String and ObjectId
                // e.g. findById("52773") or findById("ObjectId("52773")) both will work.
                // Note that I am talking about type 'ObjectId', just writing 'ObjectId("id")' does not change its type it is still string.
                // However, in mongo aggregation pipelines, it does not automatically convert strings to type ObjectId
                // Therefore, in case, id where to be fetched from params/queries, we would have to write:-
                //& const { id } = req.params
                //& $match: { 
                //&     _id: new mongoose.Types.ObjectId(id) // manual conversion needed
                //& }

                _id: req.user?._id
            }
        },
        // we are looking for all videos which match watchHistory. Now watchHistory is an array so
        // lookup iterates through all id's in watchHistory and gets all matching videos.
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        // In all video documents fetched, there is an 'owner' field which is ObjectId of User model
                        // To get actual details of owner we run a sub-pipeline. Owner (Objectid) of each video is 
                        // matched to User documents to get details. Now we run another sub-pipeline to project only
                        // required information i.e. username, fullName (not really necessary) and avatar.
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1,
                                    }
                                }
                            ]
                        }
                    },
                    // 'owner' returned will also be an array with a single object as it is a pipeline result only.
                    // so owner: [{}]. To make life of frontend devs easier, we replace it with 1st element of array
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner" // replaces 'owner' with 'first' element of '$owner' array
                                //& $arrayElemAt: ["$owner", 0] // replaces 'owner' with '0' index element in array '$owner'
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(new ApiResponse(200, user[0].watchHistory, "User's watch history fetched successfully"))
})

export { 
    registerUser, 
    loginUser, 
    logoutUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser, 
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}