const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('user_db.json');
const db = low(adapter);
const bcrypt = require('bcrypt');
const scraper = require('./scrape');
const randomColor = require('random-color');


db.defaults({users: []}).write();

module.exports = {
    //Need to add Try Catches to error check when updating db values
    addNewUser: function(username, password, schoolUsername, isAdmin) {

        let lc_username = username.toLowerCase();
        return new Promise((resolve, reject) => {

            if (this.userExists(lc_username)) {
                return resolve({success: false, message: "Username already in use."});
            }

            if (!isAlphaNumeric(username) || username.length > 16) {
                return resolve({success: false, message: "Username must contain only letters and numbers."});
            }

            if (password.length < 6 || password.length > 64) {
                return resolve({success: false, message: "Password must be 6 - 64 characters in length."})
            }

            if (!validateEmail(schoolUsername)) {
                return resolve({success: false, message: "This must be your .bcp email."});
            }

        const roundsToGenerateSalt = 10;
            bcrypt.hash(password,roundsToGenerateSalt,function(err, hash) {
                db.get('users').push(
                    {
                        username: lc_username,
                        password: hash,
                        schoolUsername: schoolUsername,
                        isAdmin: isAdmin,
                        appearance: {
                            darkMode: true,
                            accentColor: null,
                            classColors: [],
                        },
                        alerts: {
                            lastUpdated: 'never',
                            updateGradesReminder: 'daily',
                        },
                        weights: {},
                        grades: [],
                    }).write();

                return resolve({success: true, message: "User Created"});
            });
        })

    },
    login: function(username, password) {
        let lc_username = username.toLowerCase();
        let user = db.get('users').find({username: lc_username}).value();
        bcrypt.compare(password, user.password, function (err, res) {
            if (res) {
                return {success: true, message: "Login Successful"};
            } else {
                return {success: false, message: "Login Failed"};
            }
        });
    },
    changePassword: function(username, password) {
        let lc_username = username.toLowerCase();
        if (password.length < 6 || password.length > 64) {
            return {success: false, message: "Password must be 6 - 64 characters in length."};
        }
        let roundsToGenerateSalt = 10;
        bcrypt.hash(password,roundsToGenerateSalt,function(err,hash) {
            db.get('users').find({username: lc_username}).assign({password: hash}).write();
        });
        return {success: true, message: "Password Updated"};
    },
    changeSchoolEmail: function(username, schoolUsername) {
        let lc_username = username.toLowerCase();
        if (!validateEmail(schoolUsername)) {
            return {success: false, message: "This must be your .bcp email."};
        }
        db.get('users').find({username: lc_username}).assign({schoolUsername: schoolUsername}).write();
        return {success: true, message: "School Email Updated"};
    },
    removeUser: function(username, password) {
        let lc_username = username.toLowerCase();
        db.get('users').find({username: lc_username}).remove().write();
        return {success: true, message: "Account deleted."};
    },
    userExists: function(username) {
        let lc_username = username.toLowerCase();
        let user = db.get('users').find({username: lc_username}).value();
        return !!user;

    },
    setMode: function(username, darkMode) {
        let lc_username = username.toLowerCase();
        let user = db.get('users').find({username: lc_username}).value();
        user.appearance.darkMode = darkMode;
    },
    setUpdateGradesReminder: function(username, updateGradesReminder) {
        let lc_username = username.toLowerCase();
        let user = db.get('users').find({username: lc_username}).value();
        user.alerts.updateGradesReminder = updateGradesReminder;
        if (updateGradesReminder == 'Never') {
            return {success: true, message: "Grade update alerts disabled."}
        }
        return {success: true, message: updateGradesReminder + " grade update alerts enabled!"}
    },
    getUser: function(username) {
        let lc_username = username.toLowerCase();
        let user = db.get('users').find({username: lc_username}).value();
        //Parse weights with unicode to dots
        if (user) {
            user.weights = JSON.parse(JSON.stringify(user.weights).replace(/\\\\u002e/g, "."));
        }
        return user;
    },

    updateGrades: async function(acc_username, school_password) {
        let lc_username = acc_username.toLowerCase();
        let userRef = db.get('users').find({username: lc_username});
        let grade_update_status = await scraper.loginAndScrapeGrades(userRef.value().schoolUsername, school_password);
        // console.log(grade_update_status);
        if (!grade_update_status.success) {
            //error updating grades
            return grade_update_status;
        }
        let alreadyGrades = userRef.value().grades.length;
        let lockedColorIndices = new Array(alreadyGrades).fill().map((e,i) => i.toString());
        userRef.assign({grades: grade_update_status.new_grades}).write();
        this.setRandomClassColors(lc_username, lockedColorIndices);
        userRef.get('alerts').set('lastUpdated',Date.now()).write();
        return {success: true, message: "Updated grades!"};
    },

    setRandomClassColors: function(username, lockedColorIndices) {
        let lc_username = username.toLowerCase();
        let userRef = db.get('users').find({username: lc_username});
        let grades = userRef.get('grades').value();
        let numClasses = Object.keys(grades).length;
        let classColors = userRef.get('appearance').get('classColors').value();
        for (let i = 0; i < numClasses; i++) {
            if (!(lockedColorIndices.includes(i.toString()))) {
                classColors[i] = randomColor(0.75, 0.95).hexString();
            }
        }
        userRef.get('appearance').set('classColors',classColors).write();
        return {success: true, message: classColors};
    },

    getFinalWeightWithCategory: function(username, className, categoryName, finalPoints, categoryWeight) {
        console.log(username, className, categoryName, finalPoints, categoryWeight);
        let lc_username = username.toLowerCase();
        let userRef = db.get('users').find({username: lc_username});
        let grades = userRef.get('grades');
        console.log(grades.find({class_name: className}));
        let classGrades = grades.find({class_name: className}).value();
        let numPossible = 0;
        for (let i = 0; i < classGrades.length; i++) {
            if (classGrades[i].category === categoryName) {
                numPossible += classGrades[i].points_possible;
            }
        }
        if (numPossible > 0) {
            let finalWeight = finalPoints / numPossible * categoryWeight;
            return {success: true, message: finalWeight}
        } else {
            return {success: false, message: ''}
        }
    },

    calculate: function(username, currentGrade, className, categoryName, categoryWeight, goal) {

    },

    getAllUsers: function() {
        return db.get('users').value();
    },

    deleteUser: function(username) {
        let lc_username = username.toLowerCase();
        if (this.userExists(lc_username)) {
            db.get('users').remove({username: lc_username}).write();
            return {success: true, message: "Deleted user."}
        }
        return {success: false, message: "User does not exist."}
    },

    makeAdmin: function(username) {
        let lc_username = username.toLowerCase();
        if (this.userExists(lc_username)) {
            db.get('users').find({username: lc_username}).assign({isAdmin: true}).write();
            return {success: true, message: "Made user admin."}
        }
        return {success: false, message: "User does not exist."}
    },

    removeAdmin: function(username) {
        let lc_username = username.toLowerCase();
        if (this.userExists(lc_username)) {
            db.get('users').find({username: lc_username}).assign({isAdmin: false}).write();
            return {success: true, message: "Removed admin privileges."}
        }
        return {success: false, message: "User does not exist."}
    },

    updateWeightsForClass: function(username, className, weights, update=true) {
        //default update, not override
        let lc_username = username.toLowerCase();
        let userRef = db.get('users').find({username: lc_username});
        console.log(weights);
        if (!userRef.value()) {
            return {success: false, message: "User does not exist."}
        }

        let clsRef = userRef.get('grades').find({class_name: className});

        if (!clsRef.value()) {
            return {success: false, message: "Class does not exist."}
        }

        let weightsRef = userRef.get('weights');

        //Replace dots(.) with unicode escape sequence
        let modClassName = className.replace(/\./g,"\\u002e");

        if (update) {
            let currentWeights = weightsRef.get(modClassName).value();
            let newWeights = Object.assign({}, currentWeights, weights);
            weightsRef.set(modClassName, newWeights).write();
            console.log(weightsRef.value());
        } else {
            weightsRef.set(modClassName, weights).write();
            console.log(weightsRef.value());
        }
        return {success: true, message: "Updated weights for " + className + "!"};
    }
};

function isAlphaNumeric(str) {
    let code, i, len;

    for (i = 0, len = str.length; i < len; i++) {
        code = str.charCodeAt(i);
        if (!(code > 47 && code < 58) && // numeric (0-9)
            !(code > 64 && code < 91) && // upper alpha (A-Z)
            !(code > 96 && code < 123)) { // lower alpha (a-z)
            return false;
        }
    }
    return true;
}

function validateEmail(email) {
    let re = /\S+@bcp+\.org+/;
    return re.test(email);
}

/*

example of weights object

{
    "Biology H":
    {
        "Test": 50,
        "Final": 25,
        "Quiz": 25,
    }
}
 */
