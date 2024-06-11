const express = require("express");
require("dotenv").config()
const clc = require("cli-color");
const mongoose = require("mongoose");
const validator = require("validator")
const session = require("express-session");
const mongoDbSession = require('connect-mongodb-session')(session)
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken");

//file imports
const { cleanupAndValidate, generateJWTToken, sendverificationmail } = require("./utils/authUtils");
const userModel = require('./models/userModel');
const todoModel = require('./models/todoModel');
const isAuth = require("./middleware/isAuth");
const rateLimiting = require("./middleware/ratelimiting");

//constants
const app = express();
const PORT = process.env.PORT;
const store = new mongoDbSession({
    uri: process.env.MONGO_URI,
    collection: "sessions",
})

// middleware
app.set("view engine", "ejs")
app.use(express.urlencoded({extended:true}))
app.use(express.json());
app.use(
    session({
        secret: process.env.SECRET_KEY,
        resave:false,
        saveUninitialized: false,
        store: store
    })
);
app.use(express.static("public"));

//DB connections
mongoose.connect(process.env.MONGO_URI)
.then(()=>{
    console.log(clc.bgGreen("connected to mongoDb"))
}) 
.catch((error) =>{
   console.log(error)
})

///api
app.get("/",(req,res) => {

   console.log("server is running")
   res.send("ok get it")
})

app.get("/register", (req, res)=> {
    return res.render("register")
})
app.post("/register", async (req, res)=> {
    console.log(req.body)
    const {name, email, username, password} = req.body;

    try {
         await cleanupAndValidate({name, email, username, password});
    } catch (error) {
        return res.send({
            status: 400,
            message:"Data error",
            error: error
        })
    }
    //email and username are unique
    const userEmailExists = await userModel.findOne({email: email});
    if(userEmailExists){
        return res.send({
            status: 400,
            message:"email already exist"
        })
    } 
    const userUserExist = await userModel.findOne({username});
    if(userUserExist){
        return res.send({
            status: 400,
            message:"username already exist"
        })
    } 
    
    
    //hashing the password
     
    const hashedpassword = await bcrypt.hash(password,parseInt(process.env.SALT));
    console.log(password, hashedpassword)
     
    //store data in DB
    const userObj = new userModel({
        //Schema key: value
        name: name,
        email: email,
        username: username,
        password: hashedpassword,
    })
   
    try {
        const userDb = await userObj.save();
        
        // generate token
         const verifyToken = generateJWTToken(email);
         
         // send email
         sendverificationmail({email, verifyToken})
        
         res.render('verification', {
            status: 200,
            message: "Link has been sent to your email, please verify your email."
        });
    } catch (error) {
        return res.send({
            status: 500,
            message:"database error",
            error: error,
        })
    }
})
app.get("/verifytoken/:token", async (req, res) => {
    console.log(req.params);

    const token = req.params.token;
    jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
       const userEmail = decoded;

       try {
        await userModel.findOneAndUpdate({email: userEmail}, {isEmailAuthenticated: true})
        return res.redirect("/login") 
       } catch (error) {
         return res.send({
            status: 500,
            message: "database error",
            error: error
         })
       }
       
    })
})

app.get("/login", (req, res)=> {
    return res.render("login")
})
app.post("/login", async (req, res)=> {
    console.log(req.body)
    const {loginId, password} = req.body;

    // find the user with loginId
    try {
        let userDb;
        if(validator.isEmail(loginId)){
            userDb = await userModel.findOne({email: loginId})
            if(!userDb) {
                return res.send({
                    status: 400,
                    message: "Email not found"
                })
            }      
        }else {
            userDb = await userModel.findOne({username: loginId})
            if(!userDb) {
                return res.send({
                    status: 400,
                    message: "username not found"
                })
            }
        }
      
   // if email is authenticated or not
    if(userDb && !userDb.isEmailAuthenticated) {
        return res.send({
            status: 400,
            message: "please authenticate email before login. "
        })
    }
        //compare passsword
        const isMatched = await bcrypt.compare(password, userDb.password);

        if(!isMatched) {
            return res.send({
                status: 400,
                message:"password incorrect",
            })
        }
  //session base auth
  console.log(req.session);
  req.session.isAuth = true;
  req.session.user ={
    email: userDb.email,
    username: userDb.username,
    userId: userDb._id
  }

         return res.redirect('/dashboard')
    } catch (error) {
        return res.send({
            status: 500,
            message:"database error",
            error: error,
        })
    }
    
})
app.get("/dashboard", isAuth ,async (req, res) => {
    return res.render("dashboard")
})

app.post("/logout", isAuth, (req, res) => {
    console.log(req.session.id);
    req.session.destroy((err) => {

        if(err) {
            console.log(err);
            return res.send({
                status: 500,
                message: "logout unsuccessfull",
                error: err
            })
        }
        return res.redirect('/login')
    })
})

app.post("/logout_from_all",isAuth , async (req, res) => {
    const username = req.session.user.username;

    //schema
    const sessionSchema = new mongoose.Schema({_id: String}, { strict: false});
    const sessionModel = mongoose.model("session", sessionSchema);

    try {
        const deleteDb = await sessionModel.deleteMany({
            "session.user.username" : username,
        })

        return res.send({
            status: 200,
            message: "logout successful",
            data: deleteDb
        })
    } catch (error) {
     return res.send({
        status: 500,
        message:"database errror",
        error: error
     })
    }

})

//todo apis
app.post("/create-item", isAuth, rateLimiting,  async (req,res) => {
    const todoText = req.body.todo;
    const username = req.session.user.username;

    if(!todoText){
        return res.send({
            status: 400,
            message:"mising todo text"
        })
    }else if( typeof todoText !== 'string'){
        return res.send({
            status: 400,
            message:"todo text is not string"
        })
    }else if(todoText.length < 3 || todoText.length > 100) {
        return res.send({
            status: 400,
            message:"todo length should be 3-100"
        })
    }

    // create a todo in Db

    const todoObj = new todoModel({
        todo: todoText,
        username: username
    });
  
    try {
        const todoDb = await todoObj.save();

         return res.send({
            status: 201,
            message: "Todo creted successfully",
            data: todoDb,
         })
    } catch (error) {
        return res.send({
            status: 500,
            message: "Database error",
            error: error,
         })       
    }
    
})

app.post("/edit-todo", isAuth, async (req,res) => {
    const {id, newData} = req.body;
    const username = req.session.user.username;

    //find todo with id
    try {
        const todoDb = await todoModel.findOne({_id: id});
        console.log(todoDb);
        
        if( username !== todoDb.username) {
            return res.send({
                status: 403,
                message:"not allowed to edit, auth failed"
            })
        }

        const todoPrev = await todoModel.findByIdAndUpdate(
            { _id: id },
            { todo: newData }
        );

        return res.send({
            status: 200,
            message:"todo updated successfully",
            data: todoPrev,
        })
    } catch (error) {
        return res.send({
            status: 500,
            message:"database error",
            error: error
        })
    }
   
})

app.post('/delete-item', isAuth, async (req,res)=> {
    const id = req.body.id;
    const username = req.session.user.username;

    if(!id){
        return res.send({
            status: 400,
            message:"missing credentials"
        })
    }
     //find the todo with id 
     try {
        const todoDb = await todoModel.findOne({_id : id})

        //check ownership
        if (username !== todoDb.username) {
            return res.send({
                status: 403,
                message: "Not allowed to delete, Auth failed"
            })
        }
        const todoprev = await todoModel.findOneAndDelete({_id: id});
        console.log(todoDb);
        return res.send({
            status: 200,
            message: "Todo deleted successfully",
            data: todoprev
        });  

     } catch (error) {
        return res.send({
            status: 500,
            message:"Database error",
            error:error
        });
     }
})

app.get("/read-item",isAuth, async (req, res) => {
    const username = req.session.user.username;

    try {
        const todoDbs = await todoModel.find({ username});
        console.log(todoDbs);
        return res.send({
            status: 200,
            message: "Read success",
            data: todoDbs
        });
    } catch (error) {
        return res.send({
            status: 500,
            message: "Database error",
            error: error
        })
    }
})

app.get("/pagination", isAuth, async (req, res) => {
    const SKIP = req.query.skip || 0;
    const LIMIT = 5;
    const username = req.session.user.username;

    //mongodb aggregate functions
    // pagination, match
    try{
      const todos = await todoModel.aggregate([
        { $match: { username : username} },
        {
            $facet: {
                data: [{ $skip: parseInt(SKIP) }, { $limit: LIMIT }]
            }
        }
      ]);

    //   console.log(todos[0].data);
      res.send({
        status: 200,
        message: "Read success",
        data: todos[0].data
      });

    } catch (error) {
        return res.send({
            status: 500,
            message: "Database error",
            error: error
        })
    }
    
})

app.listen(PORT,()=>{
    console.log((`server is running at ${PORT}`))
})