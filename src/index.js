// require('dotenv').config({path: './env'})
import dotenv from "dotenv"

// import express from "express";
// import mongoose from "mongoose";
// import { DB_NAME } from "./constants";
import { connectDB } from "./db/index.js";

dotenv.config({
    path: './env',
})

connectDB();









/*& 
This approach is not at all bad, but main index.js file is too cluttered.
const app = express();

//todo iffy's are generally started with a semicolon in proffesional codebases, the ';' acts as a cleanup for any 
//todo prior statements that may cause error.
;(async () => {
    try{
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        console.log("MongoDB connected! DB Host: ${connectionInstance.connection.host}")
        //todo sometimes express encounters errors while connecting to db, but it is not a mongodb error. They are handled as:
        app.on("error", (err) => {
            console.log("Error: Express could not connect to db", err)
        })
        app.listen(process.env.PORT, ()=>{
            console.log(`Application listening on port: ${process.env.PORT}`)
        })
    } catch(err) {
        console.error("Error: MongoDB connection failed", err)
        throw err
    }
})()

*/