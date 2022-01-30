// load all the things we need
const LocalStrategy = require("passport-local").Strategy;
const dbClient = require("./dbClient");
const bcrypt = require("bcryptjs");
const socketManager = require("./socketManager");
const {getSyncStatus} = require("./dbClient");
module.exports = function (passport) {

    // =========================================================================
    // passport session setup ==================================================
    // =========================================================================
    // required for persistent login sessions
    // passport needs ability to serialize and unserialize users out of session

    // used to serialize the user for the session
    passport.serializeUser(function (user, done) {
        done(null, user.username);
    });

    // used to deserialize the user
    passport.deserializeUser(async function (username, done) {
        let res = await dbClient.getUser({username: username});
        if (res.success) {
            return done(null, res.data.value);
        }
        return done(null, null);
    });

    // =========================================================================
    // LOCAL LOGIN =============================================================
    // =========================================================================
    passport.use("local-login", new LocalStrategy({
        // by default, local strategy uses username and password, ]
        usernameField: "username",
        passwordField: "password",
        passReqToCallback: true
        // allows us to pass in the req from our route (lets us check if
        // a user is logged in or not)
    }, async function (req, username, password, done) {
        if (username) {
            username = username.toLowerCase();
        }

        await dbClient.setSyncStatus(username, "updating");

        // asynchronous
        process.nextTick(async function () {

            // if no user is found, return the message
            let res = await dbClient.userExists({username: username, schoolUsername: username});
            if (!res.success) {
                return done(null, false, req.flash("loginMessage", "Invalid Credentials"));
            }

            let user = res.data.value;
            if (user && bcrypt.compareSync(password, user.password)) {
                await dbClient.setLoggedIn(user.username);
                if ('schoolPassword' in user) {
                    let resp = await dbClient.decryptAndGetSchoolPassword(user.username, password);
                    let schoolPass = resp.data.value;
                    let _stream = (await dbClient.updateGrades(user.username, schoolPass)).data.stream;

                    _stream.on("data", async (data) => {
                        if (!('success' in data)) {
                            return;
                        }
                        if (data.success) {
                            let {term, semester} = (await dbClient.getMostRecentTermData(user.username)).data.value;
                            if (term && semester) {
                                socketManager.emitToRoom(user.username, "sync", "success-alldata", {
                                    gradeSyncEnabled: true,
                                    message: data.message,
                                    grades: JSON.stringify(req.user.grades[term][semester].filter(grades => !(["CR", false]).includes(grades.overall_letter) || grades.grades.length)),
                                    weights: JSON.stringify(req.user.weights[term][semester]),
                                    updateData: JSON.stringify(req.user.alerts.lastUpdated.slice(-1)[0])
                                });
                            } else {
                                socketManager.emitToRoom(user.username, "main", "refresh", data.message);
                            }
                        } else {
                            await dbClient.setSyncStatus(user.username, "account-inactive");
                            socketManager.emitToRoom(user.username, "sync", "fail", data.message);
                        }
                    });
                }
                return done(null, user);
            }
            return done(null, false, req.flash("loginMessage", "Invalid Credentials"));
        });
    }));
};
