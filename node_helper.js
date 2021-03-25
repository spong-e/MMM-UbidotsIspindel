/* Magic Mirror Module: MMM-UbidotsIspindel helper
 * Version: 1.0.0
 *
 * By Alun Jones https://github.com/spong-e/
 * MIT Licensed.
 */

var NodeHelper = require("node_helper");
var request = require("request");
/**
 * @alias fs
 * @see {@link http://nodejs.org/api/fs.html File System}
 */
const fs = require("fs");
const { TouchBarSlider } = require("electron");
const { timeStamp } = require("console");

module.exports = NodeHelper.create({
	// Config store e.g. this.configs["identifier"])
	configs: Object.create(null),
	// Tokens file path
	tokensFile: `${__dirname}/tokens.json`,
	// Token store e.g. this.tokens["client_id"])
	tokens: Object.create(null),

	baseApiUrl: "https://industrial.api.ubidots.com/api/v1.6",

	start: function () {
		console.log("MMM-UbidotsIspindel helper, started...");
        this.debug = true;
	},

	getData: function (moduleIdentifier) {
		this.log(`Getting data for ${moduleIdentifier}`);
		const moduleConfig = this.configs[moduleIdentifier].config;
		try {
			// Get access token
			const accessToken = this.tokens[moduleConfig.apiKey].token;
            this.getAbvLastValue(moduleIdentifier, accessToken);
            this.getTiltLastValue(moduleIdentifier, accessToken);
		} catch (error) {
			this.log('getData' + error);
		}
	},

	socketNotificationReceived: function (notification, payload) {
		var self = this;
		this.log(`Received notification: ${notification}`)
		if (notification === "SET_ISPINDEL_CONFIG") {
			// debug?
			if (payload.config.debug) {
				this.debug = true;
			}
			// Validate module config
			if (!payload.config.authToken || !payload.config.apiKey) {
				this.log(`Missing authToken or apiKey ${payload.identifier}`);
				this.sendSocketNotification("WARNING", { identifier: payload.identifier, data: { message: "Missing authToken or apiKey. Please update your config." } });
			}
			// Initialise and store module config
			if (!(payload.identifier in this.configs)) {
				this.configs[payload.identifier] = {};
			}
			this.configs[payload.identifier].config = payload.config;
            
			// Check for token authorisations
			this.fetchAuthToken(payload.identifier);
			this.readTokens();
			if (payload.config.authToken && !(payload.config.apiKey in this.tokens)) {
				this.log(`Unauthorised client id for ${payload.identifier}`);
				this.sendSocketNotification("ERROR", { identifier: payload.identifier, data: { message: "Client id unauthorised" } });
			}

			// Schedule API calls
			//this.getData(payload.identifier);
			setInterval(function () {
				self.getData(payload.identifier);
			}, payload.config.reloadInterval);
		}
	},

    getAbvLastValue: function (moduleIdentifier, accessToken) {
	try {
		var self = this;
        const { device } = this.configs[moduleIdentifier].config;
        this.makeApiRequest(moduleIdentifier, `devices/${device}/abv/lv`,'GET', accessToken, function (err, payload) {
			var data = self.handleApiResponse(moduleIdentifier, err, payload);
			if (data) {
                console.log(data.body)
                const last_value  = data.body;
                const brewData = { label: 'ABV%', value: last_value };
				self.sendSocketNotification("ABV_DATA", { identifier: moduleIdentifier, data: brewData });
			}
		});
    } catch(error) {
        this.log(error);
    }
	},
    getTiltLastValue: function (moduleIdentifier, accessToken) {
        try {
            var self = this;
            const { device } = this.configs[moduleIdentifier].config;
            this.makeApiRequest(moduleIdentifier, `devices/${device}/tilt/lv`,'GET', accessToken, function (err, payload) {
                var data = self.handleApiResponse(moduleIdentifier, err, payload);
                if (data) {
                    console.log(data.body)
                    const last_value  = data.body;
                    const brewData = { label: 'Tilt', value: last_value };
                    self.sendSocketNotification("TILT_DATA", { identifier: moduleIdentifier, data: brewData });
                }
            });
        } catch(error) {
            this.log(error);
        }
        },
    makeApiRequest: function(moduleIdentifier, url, method, acessToken, cb) {
        try {
        var apiUrl = `${this.baseApiUrl}/${url}`;
        this.log(apiUrl)
        var self = this;
        const { apiKey } = this.configs[moduleIdentifier].config;
        
        request(
            {
                url: apiUrl,
                method: method,
                headers: {
                    "X-Auth-Token": acessToken,
                    "x-ubidots-apikey": apiKey
                }
            },
            cb
        );
        } catch(error) {
            this.log(error)
        }
    },
	handleApiResponse: function (moduleIdentifier, err, payload) {
		try {
			
			if (err) {
				if (err.error && err.error.errors[0].field === "access_token" && err.error.errors[0].code === "invalid") {
					this.refreshTokens(moduleIdentifier);
				} else {
					this.log({ module: moduleIdentifier, error: err });
					this.sendSocketNotification("ERROR", { identifier: moduleIdentifier, data: { message: err.message } });
				}
			}
			// Ubidots Data
			if (payload) {
				return payload;
			}
		} catch (error) {
			// Unknown response
			this.log(`Unable to handle API response for ${moduleIdentifier}`);
		}
		return false;
	},

	fetchAuthToken: function (moduleIdentifier) {
		try {
			var authUrl = `${this.baseApiUrl}/auth/token`;
            var self = this;
			const { authToken, apiKey } = this.configs[moduleIdentifier].config;
			
			request(
				{
					url: authUrl,
					method: "POST",
					headers: {
						"X-Auth-Token": authToken,
						"x-ubidots-apikey": apiKey
					}
				},
				function (error, response, body) {
					// Lets convert the body into JSON
					var result = JSON.parse(body);
					const { token } = result;

                    self.saveToken(apiKey, token, (err, data) => {
                        self.sendSocketNotification("ERROR", { identifier: moduleIdentifier, data: { message: err } });
                    })
				}
			);
		} catch (error) {
			this.log('**** Error: ' + error);
            this.sendSocketNotification("ERROR", { identifier: moduleIdentifier, data: { message: "Client id unauthorised" } });
		}
	},

	saveToken: function (clientId, token, cb) {
        this.log('saving token ' + clientId + ' ' + token)
		var self = this;
		this.readTokens();
		// No token for clientId - delete existing
		if (clientId in this.tokens && !token) {
			delete this.tokens[clientId];
		}
		// No clientId in tokens - create stub
		if (!(clientId in this.tokens) && token) {
			this.tokens[clientId] = {};
		}
		// Add token for client
		if (token) {
			this.tokens[clientId].token = token;
		}
		// Save tokens to file
		var json = JSON.stringify(this.tokens, null, 2);
		fs.writeFile(this.tokensFile, json, "utf8", function (error) {
			if (error && cb) {
				cb(error);
			}
			if (cb) {
				cb(null, self.tokens);
			}
		});
	},
	/**
	 * @function readTokens
	 * @description reads the current tokens file
	 */
	readTokens: function () {
		if (this.tokensFile) {
			try {
				const tokensData = fs.readFileSync(this.tokensFile, "utf8");
				this.tokens = JSON.parse(tokensData);
			} catch (error) {
				this.tokens = {};
			}
			return this.tokens;
		}
	},
	/**
	 * @function log
	 * @description logs the message, prefixed by the Module name, if debug is enabled.
	 * @param  {string} msg            the message to be logged
	 */
	log: function (msg) {
		if (this.debug) {
			console.log(this.name + ":", JSON.stringify(msg));
		}
	}
});
