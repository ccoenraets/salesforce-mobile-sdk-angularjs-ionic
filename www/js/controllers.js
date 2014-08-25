angular.module('directory.controllers', [])

    .controller('ContactListCtrl', function ($scope, force) {

        $scope.searchKey = "";

        $scope.clearSearch = function () {
            $scope.searchKey = "";
            $scope.contacts = Contacts.query();
        }

        $scope.search = function () {
            force.query('select Id, Name, Title from contact WHERE name LIKE \'%' + $scope.searchKey + '%\' LIMIT 50').then(
                function (contacts) {
                    $scope.contacts = contacts.records;
                });
        }

        $scope.query = function () {
            force.query('select Id, Name, Title from contact limit 50').then(
                function (contacts) {
                    $scope.contacts = contacts.records;
                });
        }

        $scope.query();
    })

    .controller('ContactDetailCtrl', function($scope, $stateParams, force) {
        force.retrieve('contact', $stateParams.contactId, 'id,name,title,phone,mobilePhone,email').then(
            function (contact) {
                $scope.contact = contact;
            });
    });