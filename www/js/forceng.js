angular.module('forceng', [])

    .factory('force', function ($rootScope, $q, $window, $http) {

        var LOGIN_URL = 'https://login.salesforce.com/services/oauth2/authorize',

        // The Connected App client Id
            appId,

        // The force.com API version to use. Default can be overriden in login()
            apiVersion = 'v30.0',

        // Keep track of OAuth data (mainly access_token and refresh_token)
            oauth,

        // Only required when using REST APIs in an app hosted on your own server to avoid cross domain policy issues
            proxyURL,

        // By default we store fbtoken in sessionStorage. This can be overridden in init()
            tokenStore = {},

        // if page URL is http://localhost:3000/myapp/index.html, context is /myapp
            context = window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/")),

        // if page URL is http://localhost:3000/myapp/index.html, baseURL is http://localhost:3000/myapp
            baseURL = location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : '') + context,

        // if page URL is http://localhost:3000/myapp/index.html, oauthRedirectURL is http://localhost:3000/myapp/oauthcallback.html
            oauthRedirectURL = baseURL + '/oauthcallback.html',

        // Because the OAuth login spans multiple processes, we need to keep the success/error handlers as variables
        // inside the module instead of keeping them local within the login function.
            deferredLogin,

            loginProcessed,

        // Indicates if the app is running inside Cordova
            runningInCordova;


        document.addEventListener("deviceready", function () {
            runningInCordova = true;
        }, false);

        /**
         * Initialize ForceJS
         * @param params
         *  appId (required)
         *  apiVersion (optional)
         *  proxyURL (optional)
         *  tokenStore (optional)
         */
        function init(params) {
            if (params.appId) {
                appId = params.appId;
            }
            if (params.accessToken) {
                oauth = {access_token: params.accessToken, instance_url: params.instanceURL};
            }
            apiVersion = params.apiVersion || apiVersion;
            proxyURL = params.proxyURL || proxyURL;
            tokenStore = params.tokenStore || tokenStore;
            oauthRedirectURL = params.oauthRedirectURL || oauthRedirectURL;

            console.log(tokenStore);

            // Load previously saved token
            if (tokenStore['forceOAuth']) {
                oauth = JSON.parse(tokenStore['forceOAuth']);
            }

            console.log('oauthRedirectURL: ' + oauthRedirectURL);
        }

        /**
         * Login to Salesforce using OAuth. If running in a Browser, the OAuth workflow happens in a a popup window.
         * If running in Cordova container, it happens using the In-App Browser. Don't forget to install the In-App Browser
         * plugin in your Cordova project: cordova plugins add org.apache.cordova.inappbrowser.
         * @param success - function to call back when login succeeds
         * @param error - function to call back when login fails
         */
        function login() {

            var loginWindow,
                startTime;

            if (!appId) {
                throw 'appId parameter not set in init()';
            }

            deferredLogin = $q.defer();

            loginProcessed = false;

            // Inappbrowser load start handler: Used when running in Cordova only
            function loginWindow_loadStartHandler(event) {
                var url = event.url;
                if (url.indexOf("access_token=") > 0 || url.indexOf("error=") > 0) {
                    console.log('********* got token');
                    loginProcessed = true;
                    // When we get the access token fast, the login window (inappbrowser) is still opening with animation
                    // in the Cordova app, and trying to close it while it's animating generates an exception. Wait a little...
                    var timeout = 600 - (new Date().getTime() - startTime);
                    setTimeout(function () {
                        loginWindow.close();
                    }, timeout > 0 ? timeout : 0);
                    oauthCallback(url);
                }
            }

            // Inappbrowser exit handler: Used when running in Cordova only
            function loginWindow_exitHandler() {
                console.log('exit and remove listeners');
                // Handle the situation where the user closes the login window manually before completing the login process
                if (!loginProcessed) {
                    deferredLogin.reject({error: 'user_cancelled', error_description: 'User cancelled login process', error_reason: "user_cancelled"});
                }
                loginWindow.removeEventListener('loadstart', loginWindow_loadStartHandler);
                loginWindow.removeEventListener('exit', loginWindow_exitHandler);
                loginWindow = null;
                console.log('done removing listeners');
            }

            startTime = new Date().getTime();
            loginWindow = window.open(LOGIN_URL + '?client_id=' + appId + '&redirect_uri=' + oauthRedirectURL +
                '&response_type=token', '_blank', 'location=no');

            // If the app is running in Cordova, listen to URL changes in the InAppBrowser until we get a URL with an access_token or an error
            if (runningInCordova) {
                loginWindow.addEventListener('loadstart', loginWindow_loadStartHandler);
                loginWindow.addEventListener('exit', loginWindow_exitHandler);
            }

            return deferredLogin.promise;

            // Note: if the app is running in the browser the loginWindow dialog will call back by invoking the
            // oauthCallback() function. See oauthcallback.html for details.
        }

        /**
         * Called internally either by oauthcallback.html (when the app is running the browser) or by the loginWindow loadstart event
         * handler defined in the login() function (when the app is running in the Cordova/PhoneGap container).
         * @param url - The oauthRedictURL called by Salesforce at the end of the OAuth workflow. Includes the access_token in the querystring
         */
        function oauthCallback(url) {

            // Parse the OAuth data received from Facebook
            var queryString,
                obj;

            if (url.indexOf("access_token=") > 0) {
                queryString = url.substr(url.indexOf('#') + 1);
                obj = parseQueryString(queryString);
                console.log(obj);
                oauth = obj;
                tokenStore['forceOAuth'] = JSON.stringify(oauth);
                if (deferredLogin) deferredLogin.resolve();
            } else if (url.indexOf("error=") > 0) {
                queryString = decodeURIComponent(url.substring(url.indexOf('?') + 1));
                obj = parseQueryString(queryString);
                if (deferredLogin) deferredLogin.reject(obj);
            } else {
                if (deferredLogin) deferredLogin.reject({status: 'access_denied'});
            }
        }

        /**
         * Check the login status
         * @returns {boolean}
         */
        function isLoggedIn() {
            return (oauth && oauth.access_token) ? true : false;
        }

        /**
         * Lets you make any Facebook Graph API request.
         * @param obj - Request configuration object. Can include:
         *  method:  HTTP method: GET, POST, etc. Optional - Default is 'GET'
         *  path:    path in to the Salesforce endpoint - Required
         *  params:  queryString parameters as a map - Optional
         *  data:  JSON object to send in the request body - Optional
         *  success: function to call back when request succeeds - Optional
         *  error: function to call back when request fails - Optional
         */
        function request(obj) {

            if (!oauth || (!oauth.access_token && !oauth.refresh_token)) {
                if (obj.error) {
                    obj.error('No access_token');
                }
                return;
            }

            var method = obj.method || 'GET',
                headers = {},
                url,
                deferred = $q.defer();

            url = oauth.instance_url + obj.path;

            headers["Authorization"] = "OAuth " + oauth.access_token;
            if (obj.contentType) {
                headers["Content-Type"] = obj.contentType;
            }
            if (proxyURL) {
                console.log('setting "salesforce-url" header: ' + url);
                headers["salesforce-url"] = url;
            }

            $http({
                headers: headers,
                method: method,
                url: proxyURL ? proxyURL : url,
                params: obj.params,
                data: obj.data })
                .success(function(data, status, headers, config) {
                    console.log('request succeeded');
                    console.log(data);
                    deferred.resolve(data);
                })
                .error(function(data, status, headers, config) {
                    console.log('request failed');
                    console.log(data);
                    if (status === 401 && oauth.refresh_token) {
                        refreshToken()
                            .success(function () {
                                // Try again with the new token
                                request(obj)
                            })
                            .error(function () {
                                deferred.reject(data);
                            });
                    } else {
                        deferred.reject(data);
                    }

                });

            return deferred.promise;
        }

        function refreshToken() {
            console.log('Attempting to refresh OAuth token...');

            var params = {
                    'grant_type': 'refresh_token',
                    'refresh_token': oauth.refresh_token,
                    'client_id': appId
                },

                headers = {},

                url = oauth.instance_url + '/services/oauth2/token?' + toQueryString(params);

            if (proxyURL) {
                headers["salesforce-url"] = url;
            }

            return $http({
                headers: headers,
                method: 'POST',
                url: proxyURL ? proxyURL : url,
                params: params})
                .success(function(data, status, headers, config) {
                    console.log('refreshToken succeeded');
                    console.log(data);
                    oauth.access_token = data.access_token;
                    tokenStore['forceOAuth'] = JSON.stringify(oauth);
                })
                .error(function(data, status, headers, config) {
                    console.log('refreshToken failed');
                });
        }

        function deleteToken() {
            delete oauth.access_token;
            tokenStore['forceOAuth'] = JSON.stringify(oauth);
            console.log('Token deleted');
        }

        function query(soql) {

            return request({
                path: '/services/data/' + apiVersion + '/query',
                params: {q: soql}
            });

        }

        function retrieve(objectName, id, fields) {

            return request({
                path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + id,
                params: fields ? {fields: fields} : undefined
            });

        }

        function create(objectName, data) {

            return request({
                method: 'POST',
                contentType: 'application/json',
                path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/',
                data: data
            });

        }

        function update(objectName, data) {

            var id = data.Id,
               fields = angular.copy(data);

            delete fields.attributes;
            delete fields.Id;

            return request({
                method: 'POST',
                contentType: 'application/json',
                path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + id,
                params: {'_HttpMethod': 'PATCH'},
                data: fields
            });

        }

        function del(objectName, id) {

            return request({
                method: 'DELETE',
                path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + id
            });

        }

        function upsert(objectName, externalIdField, externalId, data) {

            return request({
                method: 'PATCH',
                contentType: 'application/json',
                path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + externalIdField + '/' + externalId,
                data: data
            });

        }

        function parseQueryString(queryString) {
            var qs = decodeURIComponent(queryString),
                obj = {},
                params = qs.split('&');
            params.forEach(function (param) {
                var splitter = param.split('=');
                obj[splitter[0]] = splitter[1];
            });
            return obj;
        }

        function toQueryString(obj) {
            var parts = [];
            for (var i in obj) {
                if (obj.hasOwnProperty(i)) {
                    parts.push(encodeURIComponent(i) + "=" + encodeURIComponent(obj[i]));
                }
            }
            return parts.join("&");
        }

        // The public API
        return {
            init: init,
            login: login,
            isLoggedIn: isLoggedIn,
            request: request,
            query: query,
            create: create,
            update: update,
            del: del,
            upsert: upsert,
            retrieve: retrieve,
            deleteToken: deleteToken,
            oauthCallback: oauthCallback
        }

    });

// Global function called back by the OAuth login dialog
function oauthCallback(url) {
    var injector = angular.element(document.body).injector();
    injector.invoke(function (force) {
        force.oauthCallback(url);
    });
}