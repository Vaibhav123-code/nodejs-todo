const mongoose = require("mongoose");
const Schema = mongoose.Schema 

const userSchema = new Schema({
    name: {
        type: String
    },
    email: {
        type: String,
        require: true,
        unique: true
    },
    username: {
        type: String,
        require: true,
        unique: true
    },
    password: {
        type: String,
        require: true,
    },
    isEmailAuthenticated : {
        type : Boolean,
        require:true,
        default : false
    }
}) 
module.exports = mongoose.model("user",userSchema)