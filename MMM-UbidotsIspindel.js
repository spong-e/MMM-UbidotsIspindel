Module.register("MMM-UbidotsIspindel", {
	// Default module config.
	defaults: {
		authToken: "",
		apiKey: "",
		device: "",
		locale: config.language,
		reloadInterval: 5 * 2 * 1000, // every 5 minutes
		updateInterval: 10 * 1000, // 10 seconds
		debug: true, // Set to true to enable extending logging
		digits: 1 // digits for ABV & titl
	},

	start: function () {
		this.log("Starting module: " + this.name);

		// Set up the local values, here we construct the request url to use
		// this.units = this.config.units;
		this.loaded = false;
		// this.url = 'https://api.weatherbit.io/v2.0/forecast/daily?key=' + this.config.api_key + '&lat=' + this.config.lat + '&lon=' + this.config.lon + '&units=' + this.config.units + '&lang=' + this.config.lang + '&days=3';
		this.abvData = {};
		this.titlData = {};
		// this.horizontalView = this.config.horizontalView;

		// Trigger the first request
		this.sendSocketNotification("SET_ISPINDEL_CONFIG", { identifier: this.identifier, config: this.config });
	},

	getDom: function () {
		var wrapper = document.createElement("div");
		if (this.loaded) {
            var html =  "<table cellspacing=2><tr>";
            

                
			if (this.abvData && this.abvData.value) {
				html = html + `<td>${this.abvData.label}</td><td>${this.formatNumber(this.abvData.value, this.config.digits)}</td>`;
			}
			if (this.tiltData && this.tiltData.value) {
				html = html + `<td>${this.tiltData.label}</td><td>${this.formatNumber(this.tiltData.value, this.config.digits)}</td>`;
			}
            html = html + "</tr></table>";
            wrapper.innerHTML = html;
		} else {
			// Otherwise lets just use a simple div
			wrapper.innerHTML = this.translate("LOADING");
		}

		return wrapper;
	},

	/**
	 * @function log
	 * @description logs the message, prefixed by the Module name, if debug is enabled.
	 * @param  {string} msg            the message to be logged
	 */
	log: function (msg) {
		if (this.config && this.config.debug) {
			Log.info(`${this.name}: ` + JSON.stringify(msg));
		}
	},
	// formatNumber
	formatNumber: function (value, digits) {
		var rounder = Math.pow(10, digits);
		return (Math.round(value * rounder) / rounder).toFixed(digits);
	},

	/*
	 * @function socketNotificationReceived
	 * @description Handles incoming messages from node_helper.
	 * @override
	 *
	 * @param {string} notification - Notification name
	 * @param {Object,<string,*} payload - Detailed payload of the notification.
	 */
	socketNotificationReceived: function (notification, payload) {
		this.log(`Receiving notification: ${notification} for ${payload.identifier}`);
		if (payload.identifier === this.identifier) {
			if (notification === "ABV_DATA") {
				this.abvData = payload.data;
				this.loaded = true;
				this.updateDom();
			} else if (notification === "TILT_DATA") {
				this.tiltData = payload.data;
				this.loaded = true;
				this.updateDom();
			} else if (notification === "ERROR") {
				this.loaded = true;
				this.error = payload.data.message;
				this.updateDom();
			} else if (notification === "WARNING") {
				this.loaded = true;
				this.sendNotification("SHOW_ALERT", { type: "notification", title: payload.data.message });
			}
		}
	}
});
