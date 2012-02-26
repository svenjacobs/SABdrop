/*jshint browser: true, nomen: false, indent: 4 */
/*global window, XMLHttpRequest, JSON, escape, console*/
(function () {
    'use strict';

    /**
     * JavaScript API for accessing a SABnzbd server.
     *
     *   new SABapi(host, apiKey)
     *   - Creates SABapi object with API key authentication method
     *
     *   new SABapi(host, username, password)
     *   - Creates SABapi object with username/password authentication method
     *
     * Properties and functions with a leading underscore are meant to be
     * private and should not be called/accessed externally.
     *
     * @author Sven Jacobs <mail@svenjacobs.com>
     */
    function SABapi(host, apiKeyOrUsername, password) {
        this._host = null;
        this._authMethod = 'apikey';
        this._apiKey = null;
        this._username = null;
        this._password = null;

        if (host !== undefined) {
            this.setHost(host);
        }

        if (apiKeyOrUsername !== undefined && password !== undefined) {
            this.setAuthMethod('login');
            this.setUsername(apiKeyOrUsername);
            this.setPassword(password);
        } else if (apiKeyOrUsername !== undefined) {
            this.setAuthMethod('apikey');
            this.setAPIKey(apiKeyOrUsername);
        }
    }

    /**
     * Sends a XHR request to the SABnzbd API.
     *
     * Parameter 'args' is a map which may contain the following key/value pairs
     *
     * params (required) - Map of key/value pairs that get translated into URL parameters
     * success (optional) - Callback function(responseText) for success
     * error (optional) - Callback function(responseText) for error
     * noAuth (optional) - If true, no authentication parameters will be appended to query
     * post (optional)- If true, sends request as POST instead of GET
     *
     * @private
     */
    SABapi.prototype._request = function (args) {
        var params = args.params,
            prop,
            query,
            xhr;

        if (typeof params !== 'object') {
            if (args.error) {
                args.error(null);
            }
            return;
        }

        if (!args.noAuth) {
            if (this._authMethod === 'apikey') {
                params.apikey = this._apiKey;
            } else {
                params.ma_username = this._username;
                params.ma_password = this._password;
            }
        }

        query = '';
        for (prop in params) {
            if (params.hasOwnProperty(prop)) {
                if (query) {
                    query += '&';
                }
                query += prop + '=' + escape(params[prop]);
            }
        }

        xhr = new XMLHttpRequest();

        xhr.onreadystatechange = function () {
            if (this.readyState === 4) {
                if (this.status === 200) {
                    if (args.success) {
                        args.success(xhr.responseText);
                    }
                } else {
                    if (args.error) {
                        args.error(xhr.responseText);
                    }
                }
            }
        };

        xhr.onerror = function (e) {
            console.error(e);
            if (args.error) {
                args.error(xhr.responseText);
            }
        };

        if (args.post === true) {
            xhr.open('POST', this._host + 'api', true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.send(query);
        } else {
            xhr.open('GET', this._host + 'api?' + query, true);
            xhr.send();
        }
    };

    /**
     * See _request()
     *
     * However args.success is a function(responseJSON, responseText)
     *
     * @private
     */
    SABapi.prototype._jsonRequest = function (args) {
        if (typeof args.params !== 'object') {
            if (args.error) {
                args.error(null);
            }
            return;
        }

        var success = args.success;

        if (success) {
            args.success = function (responseText) {
                success(JSON.parse(responseText), responseText);
            };
        }

        args.params.output = 'json';
        this._request(args);
    };

    SABapi.prototype._getFile = function (link, callback) {
        var xhr = new XMLHttpRequest();

        xhr.onreadystatechange = function () {
            if (this.readyState === 4) {
                if (this.status === 200) {
                    callback(xhr.responseText);
                } else {
                    callback(null);
                }
            }
        };

        xhr.onerror = function (e) {
            console.error(e);
            callback(null);
        };

        xhr.open('GET', link, true);
        xhr.send();
    };

    SABapi.prototype.setHost = function (host) {
        if (!/\/$/.test(host)) {
            host += '/';
        }
        this._host = host;
    };

    /**
     * authMethod === 'apikey' || 'login'
     */
    SABapi.prototype.setAuthMethod = function (authMethod) {
        if (authMethod === 'apikey' || authMethod === 'login') {
            this._authMethod = authMethod;
        }
    };

    SABapi.prototype.setAPIKey = function (apiKey) {
        this._apiKey = apiKey;
    };

    SABapi.prototype.setUsername = function (username) {
        this._username = username;
    };

    SABapi.prototype.setPassword = function (password) {
        this._password = password;
    };

    /**
     * Send URL to SABnzbd for download.
     *
     * @param link URL
     * @param name Name for that item in download queue
     * @param category Category. Can be null or empty string (== no category)
     * @param callback A function(success, responseText)
     */
    SABapi.prototype.sendLink = function (link, name, category, callback) {
        var params = {mode: 'addurl', name: link, nzbname: name};
        if (category !== null && category !== '') {
            params.cat = category;
        }

        this._request({
            params: params,
            success: function (responseText) {
                if (responseText.replace(/\n/, '') === 'ok') {
                    callback(true, responseText);
                } else {
                    callback(false, responseText);
                }
            }
        });
    };

    /**
     * Send URL to SABnzbd as file upload.
     */
    SABapi.prototype.sendFile = function (link, name, category, callback) {
        this._getFile(link, (function (api) {
            return function (file) {
                if (file === null || file === undefined) {
                    callback(false);
                    return;
                }

                var boundary = '----SABdropFormBoundary',
                    formData = '--' + boundary + '\n',
                    xhr;

                formData += 'Content-Disposition: form-data; name=\'nzbfile\'; filename=\'' + name + '\'\n' +
                    'Content-Type: text/xml\n\n' +
                    file +
                    '\n--' + boundary + '\n' +
                    'Content-Disposition: form-data; name=\'mode\'\n\naddfile' +
                    '\n--' + boundary + '\n' +
                    'Content-Disposition: form-data; name=\'nzbname\'\n\n' + name;

                if (api._authMethod === 'apikey') {
                    formData += '\n--' + boundary + '\n' +
                        'Content-Disposition: form-data; name=\'apikey\'\n\n' + api._apiKey;
                } else {
                    formData += '\n--' + boundary + '\n' +
                        'Content-Disposition: form-data; name=\'ma_username\'\n\n' + api._username +
                        '\n--' + boundary + '\n' +
                        'Content-Disposition: form-data; name=\'ma_password\'\n\n' + api._password;
                }

                if (category) {
                    formData += '\n--' + boundary + '\n' +
                        'Content-Disposition: form-data; name=\'cat\'\n\n' + category;
                }

                formData += '\n--' + boundary + '--\n'; // last boundary

                xhr = new XMLHttpRequest();

                xhr.onreadystatechange = function () {
                    if (this.readyState === 4) {
                        if (this.status === 200) {
                            callback(true, xhr.responseText);
                        } else {
                            callback(false, xhr.responseText);
                        }
                    }
                };

                xhr.onerror = function (e) {
                    console.error(e);
                    callback(false, xhr.responseText);
                };

                xhr.open('POST', api._host + 'api', true);
                xhr.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
                xhr.send(formData);
            };
        }(this)));
    };

    /**
     * Verifies connection.
     *
     * @param callback A function(success, responseText)
     */
    SABapi.prototype.verifyConnection = function (callback) {
        this._jsonRequest({
            params: {mode: 'queue'},
            success: function (responseText) {
                if (!/'status':false/.test(responseText)) {
                    callback(true, responseText);
                } else {
                    callback(false, responseText);
                }
            },
            error: function (responseText) {
                callback(false, responseText);
            }
        });
    };

    /**
     * Returns remote authentication method.
     * responseText may contain 'none', 'apikey' or 'login'.
     *
     * @param callback A function(success, responseText)
     */
    SABapi.prototype.getRemoteAuthMethod = function (callback) {
        this._request({
            params: {mode: 'auth'},
            noAuth: true,
            success: function (responseText) {
                callback(true, responseText.replace(/\n/, '').toLowerCase());
            },
            error: function (responseText) {
                callback(false, responseText);
            }
        });
    };

    /**
     * Gets categories.
     *
     * @param callback A function(categories) where categories is an array of string
     */
    SABapi.prototype.getCategories = function (callback) {
        this._jsonRequest({
            params: {mode: 'queue'},
            success: function (json) {
                var filtered = [],
                    categories;

                if (json.queue && json.queue.categories) {
                    categories = json.queue.categories;

                    if (typeof categories === 'object') {
                        categories.forEach(function (c) {
                            if (c !== '*') {
                                filtered.push(c);
                            }
                        });
                    }
                }

                callback(filtered);
            },
            error: function () {
                callback([]);
            }
        });
    };

    /**
     * Gets slots (queued downloads)
     *
     * @param callback A function(slots)
     */
    SABapi.prototype.getSlots = function (callback) {
        this._jsonRequest({
            params: {mode: 'queue'},
            success: function (json) {
                if (json.queue && json.queue.slots && json.queue.slots instanceof Array) {
                    callback(json.queue.slots);
                }
            }
        });
    };

    /**
     * Pauses individual download
     *
     * @param id NZO id of download
     */
    SABapi.prototype.pauseDownload = function (id) {
        this._request({
            params: {
                mode: 'queue',
                name: 'pause',
                value: id
            }
        });
    };

    /**
     * Resumes individual download
     *
     * @param id NZO id of download
     */
    SABapi.prototype.resumeDownload = function (id) {
        this._request({
            params: {
                mode: 'queue',
                name: 'resume',
                value: id
            }
        });
    };

    /**
     * Deletes individual download
     *
     * @param id NZO id of download
     */
    SABapi.prototype.deleteDownload = function (id) {
        this._request({
            params: {
                mode: 'queue',
                name: 'delete',
                value: id
            }
        });
    };

    window.SABapi = SABapi;
}());
