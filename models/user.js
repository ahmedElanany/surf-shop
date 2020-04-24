const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');
const passportLocalMongoose = require('passport-local-mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
	email: { type: String, index: true, unique: true, required: true, trim: true },
  image: {
    secure_url: { type: String, default: '/images/default.jpg'},
    public_id: String
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date
  
});


UserSchema.plugin(passportLocalMongoose);

UserSchema.plugin(uniqueValidator);


module.exports = mongoose.model('User', UserSchema);
