const Review = require('../models/review');
const User = require('../models/user');
const Post = require('../models/post');
const { cloudinary } = require('../cloudinary');
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: process.env.MAPBOX_TOKEN });

function escapeRegExp(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};


const middleWare = {
	asyncErrorHandler: (fn) =>
		(req, res, next) => {
			Promise.resolve(fn(req, res, next))
						 .catch(next);
		},
	isReviewAuthor: async (req, res, next) => {
		let review = await Review.findById(req.params.review_id);
		if(review.author.equals(req.user._id)) {
			return next();
		}
		req.session.error = 'Bye bye';
		return res.redirect('/');
		},
		isLoggedIn: (req, res, next) => {
			if(req.isAuthenticated()) return next();
			req.session.error = 'You need to be logged in to do that!';
			req.session.redirectTo = req.originalUrl;
			res.redirect('/login');
		},
		isAuthor: async (req, res, next) => {
			const post = await Post.findById(req.params.id);
			if(post.author.equals(req.user._id)) {
				res.locals.post = post;
				return next();
			}
			req.session.error = 'Access denied!';
			res.redirect('back');
		},
		isValidPassword: async (req, res, next) => {
			const { user } = await User.authenticate()(req.user.username, req.body.currentPassword);
			if(user) {
				res.locals.user = user;
				next();
			}else {
				middleWare.deleteProfileImage(req);
				req.session.error = 'Incorrect current password';
				return res.redirect('/profile');
			}
		},
		changePassword: async (req, res, next) => {
			const { newPassword, passwordConfirmation } = req.body;
			if(newPassword && !passwordConfirmation){
				middleWare.deleteProfileImage(req);
				req.session.error = 'Missing password confirmation!';
				return res.redirect('/profile');
			}else if(newPassword && passwordConfirmation) {
				const { user } = res.locals;
				if(newPassword === passwordConfirmation) {
					await user.setPassword(newPassword);
					next();
				}else {
					middleWare.deleteProfileImage(req);
					req.session.error = 'New Passwords Must Match!';
					return res.redirect('/profile');
				}
			}else {
				next();
			}
		},
		deleteProfileImage: async req => {
			if(req.file) await cloudinary.v2.uploader.destroy(req.file.public_id);
		},
		async searchAndFilterPosts(req, res, next) {
			
			const queryKeys = Object.keys(req.query);
			
			if (queryKeys.length) {
				// initialize an empty array to store our db queries (objects) in
				const dbQueries = [];
				// destructure all potential properties from req.query
				let { search, price, avgRating, location, distance  } = req.query;
				
				if (search) {
					// convert search to a regular expression and 
					// escape any special characters
					search = new RegExp(escapeRegExp(search), 'gi');
					// create a db query object and push it into the dbQueries array
					// now the database will know to search the title, description, and location
					// fields, using the search regular expression
					dbQueries.push({ $or: [
						{ title: search },
						{ description: search },
						{ location: search }
					]});
				}
				
				if (location) {
					let coordinates;
					try {
						if(typeof JSON.parse(location) === 'number') {
						  throw new Error;
						}
						location = JSON.parse(location);
						coordinates = location;
					  } catch(err) {
						const response = await geocodingClient
						  .forwardGeocode({
							query: location,
							limit: 1
						  })
						  .send();
						coordinates = response.body.features[0].geometry.coordinates;
					  }
					// get the max distance or set it to 25 mi
					let maxDistance = distance || 25;
					// we need to convert the distance to meters, one mile is approximately 1609.34 meters
					maxDistance *= 1609.34;
					// create a db query object for proximity searching via location (geometry)
					// and push it into the dbQueries array
					dbQueries.push({
					  geometry: {
						$near: {
						  $geometry: {
							type: 'Point',
							coordinates
						  },
						  $maxDistance: maxDistance
						}
					  }
					});
				}
				
				if (price) {
					
					if (price.min) dbQueries.push({ price: { $gte: price.min } });
					if (price.max) dbQueries.push({ price: { $lte: price.max } });
				}
				
				if (avgRating) {
					// create a db query object that finds any post documents where the avgRating
					// value is included in the avgRating array (e.g., [0, 1, 2, 3, 4, 5])
					dbQueries.push({ avgRating: { $in: avgRating } });
				}
		
				// pass database query to next middleware in route's middleware chain
				// which is the postIndex method from /controllers/postsController.js
				res.locals.dbQuery = dbQueries.length ? { $and: dbQueries } : {};
			}
			// pass req.query to the view as a local variable to be used in the searchAndFilter.ejs partial
			// this allows us to maintain the state of the searchAndFilter form
			res.locals.query = req.query;
		
			// build the paginateUrl for paginatePosts partial
			// first remove 'page' string value from queryKeys array, if it exists
			queryKeys.splice(queryKeys.indexOf('page'), 1);
			
			const delimiter = queryKeys.length ? '&' : '?';
			
			res.locals.paginateUrl = req.originalUrl.replace(/(\?|\&)page=\d+/g, '') + `${delimiter}page=`;
			next();
		}
};

module.exports = middleWare;