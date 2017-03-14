import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { Session } from 'meteor/session';
import select2 from 'select2';
import { $ } from 'meteor/jquery';
// Collections
import { Cores } from '/imports/api/cores';
// Corresponding html file
import './manage_settings.html';


Template.manage_settings.onCreated(() => {
  Meteor.subscribe('cores');
});


Template.manage_settings.helpers({});


Template.manage_settings.onRendered(() => {
  $('select').select2();
});


Template.manage_settings.events({
  'shown.bs.modal #myModal': (event, templateInstance) => {
    // Prevent default browser form submit
    event.preventDefault();
  },
  'click .manage': (event, templateInstance) => {
    // Prevent default browser form submit
    event.preventDefault();
  },
  'click button#delete': () => {
    //TODO flowrouter address is wallet instead of portfolio
    const address = FlowRouter.getParam('address');
    const doc = Cores.findOne({ address });
    if ((doc === undefined || address === undefined)) {
      return false;
    }
    Meteor.call('cores.remove', doc._id);
    //TODO replace toast
    // Materialize.toast('Portfolio deleted!', 4000, 'blue');
    return true;
  },
});
