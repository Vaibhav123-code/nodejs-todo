const validator = require("validator")
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer")

const cleanupAndValidate = ({name, email, username, password}) => {
    return new Promise((resolve, reject) => {
      console.log(name, email,username, password)

      if(!name || !email || !username || !password)
      reject("missing credentials")

      if (typeof name !== "string") reject("datatype of name is wrong")
      if (typeof email !== "string") reject("datatype of email is wrong")
      if (typeof username !== "string") reject("datatype of username is wrong")
      if (typeof password !== "string") reject("datatype of passwordis wrong")
      
      if(username.length <= 2 || username.length > 30)
      reject("username length should be 3-30")
    
      if(password.length <=2 || password.length > 30 )
      reject("password length should be 3-30")

      if( !validator.isEmail(email))
        reject("email formate is wrong")

        resolve();
    })
}

const generateJWTToken = (email) => {
  const token = jwt.sign(email, process.env.SECRET_KEY);
  return token;
}

const sendverificationmail = ({email, verifyToken})  => {
  
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port:465,
    secure:true,
    services:'Gmail',
    auth:{
      user:'vaibhavagnihotri2001@gmail.com',
      pass:"etku vedz agln mcqu"
    },
  })
  const mailOptions = {
    from: "vaibhavagnihotri2001@gmail.com",
    to: email,
    subject: "email verification for ToDO App",
    html: `click <a href="https://nodejs-todo-2.onrender.com/verifytoken/${verifyToken}">Here </a> `
  }

  transporter.sendMail(mailOptions, (error, info) => {
    if(error)  console.log(error);
    else
      console.log(`Email has send Successfully : ${email}` + info.response);
  })
}

module.exports = {cleanupAndValidate, generateJWTToken,sendverificationmail}