class ApiError extends Error{
   /**
   * @param {number} statusCode   HTTP status code (e.g. 404, 500)
   * @param {string} message      Human‑readable error message
   * @param {Array}  errors       Any validation or detail‑level errors
   * @param {string} stackOverride  (Optional) custom stack trace
   */
    constructor(
        statusCode,
        message="Something went wrong!",
        errors = [],
        stack = "",
    ){
        super(message)
        this.statusCode = statusCode
        this.data = null
        this.message = message
        this.success = false
        this.errors = errors

        if(stack){
            this.stack = stack
        }
        else{
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export {ApiError}