import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"

const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
}))

app.use(express.json({limit: "16kb"})) // used to parse json coming in req body
app.use(express.urlencoded({extended: true, limit: "16kb"})) // parses formdata coming in req body, extended:true allows 
                                                             // nested objects within formdata
app.use(express.static("public")) // serves static files, may contain images, css, js etc.
app.use(cookieParser()) // parses cookies from request headers

// routes import
import userRouter from "./routes/user.routes.js"

//routes declaration
app.use("/api/v1/users", userRouter);

export { app }