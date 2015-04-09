angular.module('app.jamon2', ['mwl.calendar', 'angular.filter'])
 .factory('CalendarConfig', function ($rootScope, $filter, $window, $log, CalendarListener, ServicesCollection) {
     'use strict';
     var factory = this;
     /**
      * can be 'buyer' or 'seller'
      * initial state: undefined
      * @type {undefined | string}
      */
     factory.session_type = undefined;
     factory.services = ServicesCollection.read_collection;
     factory.events = $window.dirtyfauno.events;
     factory.calendar = {
         events: factory.events,
         calendarView: 'month',
         currentDay: undefined,
         control: undefined,
         eventClick: testAction,
         editEventHtml: '<i class=\'glyphicon glyphicon-pencil\'></i>',
         deleteEventHtml: '<i class=\'glyphicon glyphicon-remove\'></i>',
         editEventClick: testAction,
         deleteEventClick: testAction,
         autoOpen: false
     };

     var service = {
         get_calendar: get_calendar,
         read_session_type: read_session_type
     };

     // perhaps this config need to be in other place?
     write_session_type($window.calendar_demo.session_type);

     // listeners
     CalendarListener.event_was_clicked_handler(event_clicked_actions);
     CalendarListener.hour_was_clicked_handler(hour_clicked_actions);

     return service;

     // implementations
     function get_calendar() {
         return factory.calendar;
     }

     function read_session_type() {
         return factory.session_type;
     }

     function event_clicked_actions(event, data) {
         remove_event_user_clicked(data, function (params) {
             $rootScope.$broadcast('eventWasDeleted', params);
         });
     }

     function hour_clicked_actions(event_emitted, data) {
         add_event_to_hour_clicked(data);
     }

     function testAction() {
         $log.debug(arguments);
     }

     // private
     function write_session_type(string_type) {
         factory.session_type = string_type;
     }

     function add_event_to_hour_clicked(data) {
         if (service_can_be_added_to_hour_clicked(data, factory.services, factory.events)) {
             // perhaps use constants?
             if (factory.session_type === 'buyer') {
                 add_schedule_to_events(data, factory.calendar.events, function (params) {
                     $rootScope.$broadcast('eventWasAdded', params);
                 });
             }

             if (factory.session_type === 'seller') {
                 add_event_to_events(data, factory.calendar.events);
             }
         }

     }

     function buyer_wants_to_remove_scheduled_event(data) {
         return factory.session_type === 'buyer' && data.$event.type === 'info';
     }

     function seller_wants_to_remove_availability_event(data) {
         return factory.session_type === 'seller' && data.$event.type === 'warning';
     }

     function user_wants_to_remove_event(data) {
         return buyer_wants_to_remove_scheduled_event(data) || seller_wants_to_remove_availability_event(data);
     }

     function remove_event_user_clicked(data, callback) {
         if (user_wants_to_remove_event(data)) {
             remove_event_from_events(data.$event.unique, factory.calendar.events);
             callback({event: data.$event});
         }
     }

     function event_intersects_schedule(event_start_at_date, init_event, end_event) {
         return event_start_at_date
          .isBetween($window.moment(init_event).format('YYYY-MM-DD HH:mm'),
          $window.moment(end_event).format('YYYY-MM-DD HH:mm'));
     }

     function get_min_of_array(numArray) {
         return Math.min.apply(null, numArray);
     }

     /**
      * verify is a service can be scheduled
      * @param {object} data
      * @param {array} seller_services
      * @param {array} events
      * @returns {boolean}
      */
     function service_can_be_added_to_hour_clicked(data, seller_services, events) {
         var schedule_clicked_starts_at = $window
          .moment(data.day)
          .hour(data.hour)
          .minute(data.minute);

         var day_events = events.filter(function (event) {
             var event_start = $window.moment(event.starts_at);

             return event_start.isBetween(
              $window.moment(schedule_clicked_starts_at).subtract(1, 'day').endOf('day').format('YYYY-MM-DD HH:mm'),
              $window.moment(schedule_clicked_starts_at).endOf('day').format('YYYY-MM-DD HH:mm')
             );
         });

         var durations = seller_services.map(function (service_seller) {
             return service_seller.duration;
         });

         var min_duration_service = get_min_of_array(durations);

         var events_intersected = day_events.filter(function (day_event) {
             var day_event_start = $window.moment(day_event.starts_at);
             var schedule_clicked_ends_at = $window.moment(schedule_clicked_starts_at).add(min_duration_service, 'minutes');
             return event_intersects_schedule(day_event_start, schedule_clicked_starts_at, schedule_clicked_ends_at);
         });

         return events_intersected.length === 0;
     }

     function add_schedule_to_events(data, events_array, callback) {
         // repeated logic
         var init_event = $window
          .moment(data.day)
          .hour(data.hour)
          .minute(data.minute)
          .format('YYYY-MM-DD HH:mm');

         // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map
         var boolean_array = events_array.map(function (element) {

             return $window
               .moment(element.starts_at)
               .format('YYYY-MM-DD HH:mm') === $window.moment(init_event).format('YYYY-MM-DD HH:mm');
         });

         var event_schedule_exist = boolean_array.indexOf(true) !== -1;

         if (event_schedule_exist) {
             return false;
         }

         var end_event = $window
          .moment(data.day)
          .hour(data.hour)
          .minute(data.minute)
          .add(30, 'minutes')
          .format('YYYY-MM-DD HH:mm');

         var new_event = {
             title: 'schedule',
             type: 'info',
             service_id: undefined,
             starts_at: init_event,
             ends_at: end_event,
             unique: new Date().getTime()
         };

         // the request property will be set at backend?
         events_array.push(new_event);

         callback(new_event);
     }

     function remove_event_from_events(event_unique_id, events_array) {
         // for ie 8 we need a polyfill for 'filter'
         // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter

         // feel this filter is not the way immutable?
         // but angular does not reacts as desire

         // events_array = events_array.filter(function (element, index, array) {
         events_array.filter(function (element, index, array) {
             if (element.unique === event_unique_id) {
                 array.splice(index, 1); // mutable way ftw?
                 // return false;
             }
             // return true;
         });

         // another alternative perhaps this does not need pollyfill?

         //$filter('filter')(events_array, function(element, index){
         //   $log.debug(element.unique !== event.unique);
         //  return element.unique !== event.unique
         //}, true);
     }

     /**
      * add event to events array
      * @param {object} data
      * @param {array} events_array
      * @returns {boolean}
      */
     function add_event_to_events(data, events_array) {

         var init_event = $window
          .moment(data.day)
          .hour(data.hour)
          .minute(data.minute)
          .format('YYYY-MM-DD HH:mm');

         // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map
         var boolean_array = events_array.map(function (element) {

             return $window
               .moment(element.starts_at)
               .format('YYYY-MM-DD HH:mm') === $window.moment(init_event).format('YYYY-MM-DD HH:mm');
         });

         var event_schedule_exist = boolean_array.indexOf(true) !== -1;

         if (event_schedule_exist) {
             return false;
         }

         var end_event = $window
          .moment(data.day)
          .hour(data.hour)
          .minute(data.minute)
          .add(30, 'minutes')
          .format('YYYY-MM-DD HH:mm');

         var new_event = {
             title: 'not available',
             type: 'warning',
             starts_at: init_event,
             ends_at: end_event,
             unique: new Date().getTime()
         };

         events_array.push(new_event);
     }

     //function whenEventOnSelect(start, end, jsEvent, view) {
     //    console.log(arguments);
     //}

     //function get_days_of_the_week() {
     //    var start_of_the_week = $window.moment().startOf('week');
     //    var dates = [
     //        start_of_the_week,
     //        start_of_the_week.clone().add(1, 'day'),
     //        start_of_the_week.clone().add(2, 'day'),
     //        start_of_the_week.clone().add(3, 'day'),
     //        start_of_the_week.clone().add(4, 'day'),
     //        start_of_the_week.clone().add(5, 'day'),
     //        start_of_the_week.clone().add(6, 'day')
     //    ];
     //
     //    var formatted_dates = [];
     //
     //    angular.forEach(dates, function (value, key) {
     //        this.push(value.format('YYYY-MM-DD'));
     //    }, formatted_dates);
     //
     //    return formatted_dates;
     //
     //}
 })
 .factory('CalendarListener', function ($rootScope) {
     'use strict';
     var service = {
         hour_was_clicked_handler: when_hour_clicked,
         event_was_clicked_handler: when_event_clicked
     };

     return service;

     ////////////

     function when_event_clicked(callback) {
         $rootScope.$on('eventWasClicked', function (event, data) {
             callback(event, data);
         });
     }

     function when_hour_clicked(callback) {
         $rootScope.$on('hourWasClicked', function (event, data) {
             callback(event, data);
         });
     }
 })
 .factory('ServicesCollection', function ($window) {
     'use strict';
     var collection = $window.calendar_demo.services;

     return {read_collection: collection};
 })
 .filter('isAfter', function ($window, CalendarConfig) {
     'use strict';
     return function (services, event_service) {
         if (angular.isUndefined(event_service)) {
             return services;
         }

         var durations = services.map(function (service) {
             return service.duration;
         });

         var events = CalendarConfig.get_calendar().events;

         var day_events = events.filter(function (event) {
             var event_start = $window.moment(event.starts_at);

             return event_start.isBetween(
              $window.moment(event_service.starts_at).subtract(1, 'day').endOf('day').format('YYYY-MM-DD HH:mm'),
              $window.moment(event_service.starts_at).endOf('day').format('YYYY-MM-DD HH:mm')
             );
         });

         // remove itself event
         day_events = day_events.filter(function (event) {
             return event.unique !== event_service.unique;
         });

         var durations_that_intersects = [];

         durations.forEach(function (current_duration) {

             var booleans_array = day_events.map(function (day_event) {
                 var day_event_starts_at = $window.moment(day_event.starts_at);

                 return day_event_starts_at.isBetween(
                  $window.moment(event_service.starts_at).format('YYYY-MM-DD HH:mm'),
                  $window.moment(event_service.starts_at).add(current_duration, 'minutes').format('YYYY-MM-DD HH:mm')
                 );
             });

             var intersects = booleans_array.indexOf(true) !== -1;

             if (intersects) {
                 durations_that_intersects.push(current_duration);
             }
         });

         // return filter
         return services.filter(function (service) {
             var intersecs = durations_that_intersects.map(function (duration) {
                 return service.duration === duration;
             });

             return intersecs.indexOf(true) === -1;
         });
     };
 })
 .controller('jamonCtrl', function ($window, $rootScope, $scope, CalendarConfig, ServicesCollection) {
     'use strict';
     var vm = this;
     vm.flags = {
         hide_calendar: false
     };

     vm.event_service = undefined;
     vm.services_to_commit = [];
     vm.session_type = CalendarConfig.read_session_type();
     vm.services = ServicesCollection.read_collection;
     vm.busy_schedules = $window.dirtyfauno.events;
     vm.type_of_showed_events = 'important';
     vm.change_current_view_to = change_current_view_to;
     vm.calendar_config = CalendarConfig.get_calendar(0);

     vm.add_service_to_commit = add_service_to_commit;

     $rootScope.$on('eventWasAdded', function (event, data) {
         vm.flags.hide_calendar = true;
         vm.event_service = data;
     });

     $rootScope.$on('eventWasDeleted', function (event, data) {
         remove_service_from_stack(data.event.unique, vm.services_to_commit);
         vm.event_service = data;
     });

     function remove_service_from_stack(event_unique_id, stack) {
         // repeated 'guard' perhaps create a guard helper factory?
         if (!angular.isNumber(event_unique_id)) {
             throw Error('event_unique_id is not numeric: ' + event_unique_id);
         }

         // repeated logic

         // feel this filter is not the way immutable?
         // but angular does not reacts as desire

         // events_array = events_array.filter(function (element, index, array) {
         stack.filter(function (element, index, array) {
             if (element.unique === event_unique_id) {
                 array.splice(index, 1); // mutable way ftw?
                 // return false;
             }
             // return true;
         });
     }

     function add_service_to_stack(service, selected_service, stack) {
         if (!angular.isNumber(service.id)) {
             throw Error('service.id is not numeric: ' + service.id);
         }

         selected_service.title = service.title;
         selected_service.service_id = service.id;
         selected_service.ends_at = $window.moment(selected_service.starts_at).add(service.duration, 'minutes').format('YYYY-MM-DD HH:mm');
         stack.push(selected_service);
     }

     function add_service_to_commit(selected_service) {

         if (service_can_be_added(vm.event_service, selected_service, vm.busy_schedules)) {
             add_service_to_stack(selected_service, vm.event_service, vm.services_to_commit);
             flush_selected_service(vm.event_service);
             show_calendar_again();
         }
     }

     function service_can_be_added(event_service, selected_service, busy_schedules_array) {
         var start_service = $window.moment(event_service.starts_at).format('YYYY-MM-DD HH:mm');
         var end_service = $window.moment(event_service.starts_at).add(selected_service.duration, 'minutes').format('YYYY-MM-DD HH:mm');

         // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map
         var boolean_array = busy_schedules_array.map(function (element) {
             var busy_schedules = $window.moment(element.starts_at);
             return busy_schedules.isBetween(start_service, end_service);
         });

         var schedule_overlay_exist = boolean_array.indexOf(true) === -1;

         return schedule_overlay_exist;
     }

     function show_calendar_again() {
         vm.flags.hide_calendar = false;
     }

     function flush_selected_service(selected_service) {
         selected_service = undefined;
     }

     function change_current_view_to(new_view) {
         vm.calendar_config.calendarView = new_view;
     }
 });
