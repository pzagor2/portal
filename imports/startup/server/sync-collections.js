// / Remark: Code mostly taken from: https://github.com/makerdao/maker-market
import { Meteor } from 'meteor/meteor';
// Collections
import Cores from '/imports/api/cores';
import Orders from '/imports/api/orders';
import Trades from '/imports/api/trades';

// EXECUTION
Meteor.startup(() => {
  Cores.remove({});
  Cores.sync();
  // Cores.watch();

  // TODO
  Orders.remove({});
  // Orders.sync();
  Orders.watch();
  //
  Trades.remove({});
  Trades.watch();
});
