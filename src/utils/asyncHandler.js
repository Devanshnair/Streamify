const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err)=>next(err))
    }
}

export {asyncHandler}

// asyncHandler is a higher order function. It takes a function as an argument and returns a function. Why do we need this function?
// Many times we write async functions, for which we have wrap inside try and catch for each func. We are basically creating function
// that does that for us, so we don't have to do again and again. Let's see a example how asyncHandler fn is called.
// &  router.get(
// &   "/",
// ^   asyncHandler(async (req, res) => {
// ^     const users = await User.find();
// ^     res.json(users);
// ^   })
// & );
// So basically asyncHandler expects a function, and it returns a function which will be called by express. For e.g. in above example
// router.get("/", ()=>{}) expects a callback as 2nd parameter which is what our asyncHnadler is returning. Now, if you see, this
// returning function expects 3 paramaters req, res, next which are inherently mapped from requesthandler. the 1st parameter from 
// requestHandler fn is mapped to req, and 2nd to res and so on.
// Promise.resolve() is a static method on the Promise constructor. It’s not something you call on an instance, but on the class itself.
// If handler sometimes isn’t async (i.e. returns a value or throws synchronously), Promise.resolve() will:
// Wrap a returned value into a resolved promise. Catch a synchronous throw and turn it into a rejected promise.
// This way, whether handler is sync or async, we unify on a promise and handle errors in .catch().
//&   (req, res, next) => {
//&     requestHandler(req, res, next)
//&       .then(...)
//&       .catch(err => next(err));
//&   };
// We can do this also as long as you’re 100% sure requestHandler(req, res, next) always returns a Promise 
// (i.e. is declared async or explicitly returns a promise), and never throws synchronously before returning that promise. (this 2nd part is imp to understand)
// But if handler ever throws before returning its promise - e.g. a coding bug like if (!user) throw new Error("No user") 
// at the top - then there’s no promise yet and .catch() won’t see it. That error bubbles up immediately and crashes your process 
// (or hits Express’s default error handler, depending on version).

// const asyncHandler = () => {}
// const asyncHandler = () => {()=>{}}
// const asyncHandler = () => ()=>{}
// const asyncHandler = () => async ()=>{}

// const asyncHandler = (fn) => async (req, res, next) => {
//     try {
//         await fn(req, res, next)
//     } catch (error) {
//         res.status(error.code || 500).json({
//             success: true,
//             message: error.message,
//         })
//     }
// }