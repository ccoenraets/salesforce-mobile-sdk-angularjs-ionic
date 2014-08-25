angular.module('directory', ['ionic', 'forceng', 'directory.controllers'])

    .run(function ($ionicPlatform, $location, $state, force) {

        $ionicPlatform.ready(function () {

            if (window.StatusBar) {
                // org.apache.cordova.statusbar required
                StatusBar.styleDefault();
            }

            // Authenticate
            var oauthPlugin = cordova.require("com.salesforce.plugin.oauth");
            oauthPlugin.getAuthCredentials(
                function (creds) {
                    // Initialize ForceTK client
                    force.init({accessToken: creds.accessToken, instanceURL: creds.instanceUrl, refreshToken: creds.refreshToken});
                    $state.go('search');
                },
                function (error) {
                    alert("Authentication Error");
                }
            );

        });

    })

    .config(function ($stateProvider, $urlRouterProvider) {

        $stateProvider

            .state('default', {
                url: '',
                templateUrl: 'init'
            })

            .state('search', {
                url: '/search',
                templateUrl: 'templates/contact-list.html',
                controller: 'ContactListCtrl'
            })

            .state('contact', {
                url: '/contacts/:contactId',
                templateUrl: 'templates/contact-detail.html',
                controller: 'ContactDetailCtrl'
            })

            .state('reports', {
                url: '/contacts/:contactId/reports',
                templateUrl: 'templates/contact-reports.html',
                controller: 'ContactReportsCtrl'
            });

    });