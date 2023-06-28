const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const userModel = require("./models/User");
const PlaceModel = require("./models/Place");
const BookingModel = require("./models/Booking");
const imageDownloader = require('image-downloader');
const multer = require('multer');  
const fs = require('fs');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

require("dotenv").config();
const app = express();

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = "ahhvvev12vhhajashvvs12aksb";

app.use(express.json());
app.use(cookieParser());

app.use('/uploads', express.static(__dirname+'/uploads'));

app.use(
  cors({
    credentials: true,
    origin: "http://localhost:5173", // client url
  })
);

mongoose.connect(process.env.MONGO_URL);

function getUserDataFromToken(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, {}, async(err, userData) => {
      if(err) throw err;
      resolve(userData);
    });
  });
}

app.get("/test", (req, res) => {
  res.json("test ok");
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const userDoc = await userModel.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt),
    });
    res.json(userDoc);
  } catch (error) {
    res.status(422).json(error);
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const userDoc = await userModel.findOne({ email });

  if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign(
        { email: userDoc.email, id: userDoc._id },
        jwtSecret,
        {},
        (err, token) => {
          if (err) throw err;
          res.cookie("token", token).json(userDoc);
        }
      );
    } else {
      res.json("pass not ok");
    }
  } else {
    res.json("not found");
  }
});

app.get('/apartments', async (req, res) => {
  const { title } = req.query;
  try {
      const response = await PlaceModel.findOne({title});
      res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;

  if (token) {
    jwt.verify(token, jwtSecret, {}, async(err, userData) => {
      if (err) throw err;
      const {name,email,_id} = await userModel.findById(userData.id);
      res.json({name,email,_id});
    });
  } else {
    res.json(null);
  }
});

app.post('/logout', (req,res) => {
  res.cookie('token', '').json(true);
});

app.post('/upload-by-link', async (req,res) => {
  const {link} = req.body;
  const newName = 'photo' + Date.now() + '.jpg';

  await imageDownloader.image({
    url: link,
    dest: __dirname + '/uploads/' + newName,
  });
  res.json(newName);
});

const photosMiddleware = multer({dest:'uploads/'});
app.post('/upload', photosMiddleware.array('photos', 10), (req,res) => {
  const uploadedFiles = [];

  for(let i=0; i<req.files.length; i++) {
    const {path, originalname} = req.files[i];
    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];
    const newPath = path + '.' + ext;
    fs.renameSync(path, newPath);
    uploadedFiles.push(newPath.replace('uploads\\',''));
  }
  res.json(uploadedFiles);
});

app.post('/places', (req,res) => {
  const { token } = req.cookies;

  const { 
    title,address,addedPhotos,description, 
    perks,extraInfo,checkIn,checkOut,maxGuests,price,
  } = req.body;

  jwt.verify(token, jwtSecret, {}, async(err, userData) => {
    if (err) throw err;
    const placeDoc = await PlaceModel.create({
      owner:userData.id,
      title,address,photos:addedPhotos,description,
      perks,extraInfo,checkIn,checkOut,maxGuests,price,
    });
    res.json(placeDoc);
  });
});

app.get('/user-places', (req, res) => {
  const {token} = req.cookies;
  jwt.verify(token, jwtSecret, {}, async(err, userData) => {
    const {id} = userData;
    res.json(await PlaceModel.find({owner:id}));
  });
}); 


app.get('/places/:id', async (req,res) => {
  const {id} = req.params;
  res.json(await PlaceModel.findById(id));
})

app.delete('/places/:id', async (req,res) => {
  const {id} = req.params;
  try {
    const result = await PlaceModel.deleteOne({ _id: id });
    if (result.deletedCount === 1) {
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ success: false, message: 'Place not found' });
    }
  } catch (error) {
    console.error('Error deleting place:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
})

app.put('/places', async (req,res) => {
  const {token} = req.cookies;
  
  const {
    id, title,address,addedPhotos,description, 
    perks,extraInfo,checkIn,checkOut,maxGuests,price,
  } = req.body;

  jwt.verify(token, jwtSecret, {}, async(err, userData) => {
    const placeDoc = await PlaceModel.findById(id);
    if(userData.id === placeDoc.owner.toString()) {
      placeDoc.set({
        title,address,photos:addedPhotos,description,
        perks,extraInfo,checkIn,checkOut,maxGuests,price,
      });
      await placeDoc.save();
      res.json('ok');
    }
  });
})

app.get('/places', async (req,res) => {
  res.json(await PlaceModel.find());
});

app.post('/bookings', async (req, res) => {
  const userData = await getUserDataFromToken(req);
  const {
    place,checkIn,checkOut,numberOfGuests,name,phone,price,
  } = req.body;

  BookingModel.create({
    place,checkIn,checkOut,numberOfGuests,name,phone,price,
    user:userData.id,
  }).then((doc) => {
    res.json(doc);
  }).catch((err) => {
    throw err;
  });
});

app.get('/bookings', async(req,res) => {
  const userData = await getUserDataFromToken(req);
  res.json(await BookingModel.find({user:userData.id}).populate('place'));
})

app.listen(4000); 