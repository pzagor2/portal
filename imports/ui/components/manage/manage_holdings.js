import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { bootstrapSwitch } from 'bootstrap-switch';
import { Session } from 'meteor/session';
import { ReactiveDict } from 'meteor/reactive-dict';
import { BigNumber } from 'meteor/ethereum:web3';
import AddressList from '/imports/lib/ethereum/address_list.js';
import constants from '/imports/lib/assets/utils/constants.js';
import Specs from '/imports/lib/assets/utils/specs.js';
// Collections
import { Cores } from '/imports/api/cores';
import { Orders } from '/imports/api/orders.js';
// Contracts
import contract from 'truffle-contract';
import CoreJson from '/imports/lib/assets/contracts/Core.json'; // Get Smart Contract JSON
import ExchangeJson from '/imports/lib/assets/contracts/ExchangeProtocol.json';
import AssetJson from '/imports/lib/assets/contracts/AssetProtocol.json';
import EtherTokenJson from '/imports/lib/assets/contracts/EtherToken.json';
import ERC20Json from '/imports/lib/assets/contracts/ERC20.json';
// Utils
import { convertFromTokenPrecision } from '/imports/lib/assets/utils/functions.js';
import './manage_holdings.html';
// Specs
import specs from '/imports/lib/assets/utils/specs.js';

const Core = contract(CoreJson);
const Exchange = contract(ExchangeJson);

const numberOfQuoteTokens = specs.getQuoteTokens().length;
const numberOfBaseTokens = specs.getBaseTokens().length;
const assetPairs =
  [...Array(numberOfQuoteTokens * numberOfBaseTokens).keys()]
  .map((value, index) => [
    specs.getBaseTokens()[index % numberOfBaseTokens],
    '/',
    specs.getQuoteTokens()[index % numberOfQuoteTokens],
  ].join(''))
  .sort();


Template.manage_holdings.onCreated(() => {
  Meteor.subscribe('cores');
  Template.instance().state = new ReactiveDict();
  Template.instance().state.set({ buyingSelected: true });
  // Creation of contract object
  Core.setProvider(web3.currentProvider);
  Exchange.setProvider(web3.currentProvider);
});

const prefillTakeOrder = (id) => {
  const [baseTokenSymbol, quoteTokenSymbol] = (Session.get('currentAssetPair') || '---/---').split('/');
  const selectedOrderId = Number(Session.get('selectedOrderId'));
  const selectedOffer = Orders.find({ id: selectedOrderId }).fetch();
  const orderType = selectedOffer[0].sell.symbol === 'ETH-T' ? 'Sell' : 'Buy';

  if (orderType === 'Sell') {
    Template.instance().state.set('buyingSelected', false);
    let cheaperOrders;
    if (Session.get('fromPortfolio')) {
      cheaperOrders = Orders.find({
        isActive: true,
        'sell.symbol': quoteTokenSymbol,
        'buy.symbol': baseTokenSymbol,
        owner: AddressList.LiquidityProvider,
      }, { sort: { 'buy.price': -1, 'sell.howMuch': -1, createdAt: 1 } }).fetch();
    } else {
      cheaperOrders = Orders.find({
        isActive: true,
        'sell.symbol': quoteTokenSymbol,
        'buy.symbol': baseTokenSymbol,
      }, { sort: { 'buy.price': -1, 'sell.howMuch': -1, createdAt: 1 } }).fetch();
    }

    const index = cheaperOrders.findIndex(element => element.id === parseInt(id, 10));
    const setOfOrders = cheaperOrders.slice(0, index + 1);
    const volumeTakeOrder = setOfOrders.reduce((accumulator, currentValue) =>
      accumulator + currentValue.buy.howMuch, 0);
    const averagePrice = setOfOrders.reduce((accumulator, currentValue) =>
      (accumulator + currentValue.sell.howMuch), 0) / volumeTakeOrder;
    const buyTokenAddress = Specs.getTokenAddress(baseTokenSymbol);
    const buyTokenPrecision = Specs.getTokenPrecisionByAddress(buyTokenAddress);
    const volume = convertFromTokenPrecision(volumeTakeOrder, buyTokenPrecision);
    const total = averagePrice * volume;
    const totalWantedBuyAmount = total;

    return { volume, averagePrice, total, setOfOrders, orderType, totalWantedBuyAmount };
  } else if (orderType === 'Buy') {
    Template.instance().state.set('buyingSelected', true);
    let cheaperOrders;
    if (Session.get('fromPortfolio')) {
      cheaperOrders = Orders.find({
        isActive: true,
        'sell.symbol': baseTokenSymbol,
        'buy.symbol': quoteTokenSymbol,
        owner: AddressList.LiquidityProvider,
      }, { sort: { 'sell.price': 1, 'buy.howMuch': 1, createdAt: 1 } }).fetch();
    } else {
      cheaperOrders = Orders.find({
        isActive: true,
        'sell.symbol': baseTokenSymbol,
        'buy.symbol': quoteTokenSymbol,
      }, { sort: { 'sell.price': 1, 'buy.howMuch': 1, createdAt: 1 } }).fetch();
    }

    const index = cheaperOrders.findIndex(element => element.id === parseInt(id, 10));
    const setOfOrders = cheaperOrders.slice(0, index + 1);
    const volumeTakeOrder = setOfOrders.reduce((accumulator, currentValue) =>
      accumulator + currentValue.sell.howMuch, 0);
    const averagePrice = setOfOrders.reduce((accumulator, currentValue) =>
      (accumulator + currentValue.buy.howMuch), 0) / volumeTakeOrder;
    const sellTokenAddress = Specs.getTokenAddress(quoteTokenSymbol);
    const sellTokenPrecision = Specs.getTokenPrecisionByAddress(sellTokenAddress);
    const volume = convertFromTokenPrecision(volumeTakeOrder, sellTokenPrecision);
    const total = averagePrice * volume;
    const totalWantedBuyAmount = volume;

    return { volume, averagePrice, total, setOfOrders, orderType, totalWantedBuyAmount };
  }
};

Template.manage_holdings.helpers({
  assetPairs,
  currentAssetPair: Session.get('currentAssetPair'),
  selected: assetPair => (assetPair === Session.get('currentAssetPair') ? 'selected' : ''),
  getPortfolioDoc() {
    const address = FlowRouter.getParam('address');
    const doc = Cores.findOne({ address });
    return (doc === undefined || address === undefined) ? '' : doc;
  },
  buyOrSell() {
    if (Template.instance().state.get('buyingSelected')) {
      return 'Buy';
    }
    return 'Sell';
  },
  isBuyingSelected: () => Template.instance().state.get('buyingSelected'),
  currentAssetPair: () => {
    if (Template.instance().state.get('buyingSelected')) {
      return Session.get('currentAssetPair');
    }
    const [baseTokenSymbol, quoteTokenSymbol] = (Session.get('currentAssetPair') || '---/---').split('/');
    return `${quoteTokenSymbol}/${baseTokenSymbol}`;
  },
  priceAssetPair: () => {
    const [baseTokenSymbol, quoteTokenSymbol] = (Session.get('currentAssetPair') || '---/---').split('/');
    return `${quoteTokenSymbol}/${baseTokenSymbol}`;
  },
  volumeAsset: () => (Session.get('currentAssetPair') || '---/---').split('/')[0],
  totalAsset: () => (Session.get('currentAssetPair') || '---/---').split('/')[1],
  preFillType: () =>
    Session.get('selectedOrderId') !== null
    ? prefillTakeOrder(Session.get('selectedOrderId')).symbol
    : '',
  preFillPrice: () =>
    Session.get('selectedOrderId') !== null
    ? prefillTakeOrder(Session.get('selectedOrderId')).averagePrice
    : '',
  preFillVolume: () =>
    Session.get('selectedOrderId') !== null
    ? prefillTakeOrder(Session.get('selectedOrderId')).volume
    : '',
  preFillTotal: () =>
    Session.get('selectedOrderId') !== null
    ? prefillTakeOrder(Session.get('selectedOrderId')).total
    : '',
  getStatus() {
    if (Session.get('fromPortfolio')) return 'Manage fund';
    return 'Manage account';
  },
});

Template.manage_holdings.onRendered(() => {
  if (Session.get('fromPortfolio')) {
    $('.js-price').attr('readonly', true);
    $('#select_type').attr('disabled', true);
  }
  $('.js-from-portfolio').bootstrapSwitch({
    state: !Session.get('fromPortfolio'),
    onSwitchChange(event, state) {
      Session.set('fromPortfolio', !state);
      console.log(Session.get('fromPortfolio'));
      $('.js-price').attr('readonly') ? $('.js-price').removeAttr('readonly', false) : $('.js-price').attr('readonly', true);
      $('#select_type').attr('disabled') ? $('#select_type').removeAttr('disabled', false) : $('#select_type').attr('disabled', true);
    },
  });
});


Template.manage_holdings.events({
  'change .js-asset-pair-picker': (event) => {
    Session.set('currentAssetPair', event.currentTarget.value);
  },
  'change select#select_type': (event, templateInstance) => {
    const currentlySelectedTypeValue = parseFloat(templateInstance.find('select#select_type').value, 10);
    if (currentlySelectedTypeValue) Template.instance().state.set({ buyingSelected: false });
    else Template.instance().state.set({ buyingSelected: true });
  },
  'input input.js-price': (event, templateInstance) => {
    // by default, should insert the real time asset pair price
    const price = parseFloat(templateInstance.find('input.js-price').value, 10);
    const volume = parseFloat(templateInstance.find('input.js-volume').value, 10);
    const total = parseFloat(templateInstance.find('input.js-total').value, 10);
    if (!NaN(volume)) templateInstance.find('input.js-total').value = price * volume;
    else if (!isNaN(total)) templateInstance.find('input.js-volume').value = total / price;
  },
  'input input.js-volume': (event, templateInstance) => {
    const price = parseFloat(templateInstance.find('input.js-price').value, 10);
    const volume = parseFloat(templateInstance.find('input.js-volume').value, 10);
    if (Session.get('selectedOrderId') && volume > prefillTakeOrder(Session.get('selectedOrderId')).volume) {
      templateInstance.find('input.js-volume').value = prefillTakeOrder(Session.get('selectedOrderId')).volume;
    } else {
      templateInstance.find('input.js-total').value = price * volume;
    }
  },
  'input input.js-total': (event, templateInstance) => {
    const price = parseFloat(templateInstance.find('input.js-price').value, 10);
    const total = parseFloat(templateInstance.find('input.js-total').value, 10);
    templateInstance.find('input.js-volume').value = total / price;
  },
  'click .js-placeorder': (event, templateInstance) => {
    event.preventDefault();

    const [baseTokenSymbol, quoteTokenSymbol] = (Session.get('currentAssetPair') || '---/---').split('/');

    const managerAddress = Session.get('clientManagerAccount');
    if (managerAddress === undefined) {
      // TODO replace toast
      // Materialize.toast('Not connected, use Parity, Mist or MetaMask', 4000, 'blue');
      return;
    }
    const coreAddress = FlowRouter.getParam('address');
    const doc = Cores.findOne({ address: coreAddress });
    if (doc === undefined) {
      // TODO replace toast
      // Materialize.toast(`Portfolio could not be found\n ${coreAddress}`, 4000, 'red');
      return;
    }
    const coreContract = Core.at(coreAddress);
    const exchangeContract = Exchange.at(AddressList.Exchange);


    // Case 1: form pre-filled w order book information (when user selects an order book)
    if (Session.get('selectedOrderId') !== null) {
      const setOfOrders = prefillTakeOrder(Session.get('selectedOrderId')).setOfOrders;
      const totalWantedBuyAmount = prefillTakeOrder(Session.get('selectedOrderId')).totalWantedBuyAmount;

      // Get token address, precision and base unit volume for buy token and sell token
      const buyTokenAddress = Specs.getTokenAddress(setOfOrders[0].sell.symbol);
      const buyTokenPrecision = Specs.getTokenPrecisionByAddress(buyTokenAddress);
      const buyBaseUnitVolume = totalWantedBuyAmount * Math.pow(10, buyTokenPrecision);
      const sellTokenAddress = Specs.getTokenAddress(setOfOrders[0].buy.symbol);
      const sellTokenPrecision = Specs.getTokenPrecisionByAddress(sellTokenAddress);

      let quantity = 0;
      let quantityToApprove = 0; // will be used in case 1.2
      if (prefillTakeOrder(Session.get('selectedOrderId')).orderType === 'Sell') {
        quantity = parseFloat(templateInstance.find('input.js-total').value, 10) * Math.pow(10, buyTokenPrecision);
        quantityToApprove = parseFloat(templateInstance.find('input.js-volume').value, 10) * Math.pow(10, sellTokenPrecision);
      } else {
        quantity = parseFloat(templateInstance.find('input.js-volume').value, 10) * Math.pow(10, buyTokenPrecision);
        quantityToApprove = parseFloat(templateInstance.find('input.js-total').value, 10) * Math.pow(10, sellTokenPrecision);
      }
      // Case 1.1 : Take offer -> Trade through fund
      if (Session.get('fromPortfolio')) {
        for (let i = 0; i < setOfOrders.length; i += 1) {
          if (quantity) {
            if (quantity >= setOfOrders[i].sell.howMuch) {
              console.log('Desired uantity ', quantity, ' Available quantity ', setOfOrders[i].sell.howMuch);
              coreContract.takeOrder(AddressList.Exchange, setOfOrders[i].id, setOfOrders[i].sell.howMuch, { from: managerAddress }).then((result) => {
                console.log(result);
                console.log('Transaction for order id ', setOfOrders[i].id, ' sent!');
                Meteor.call('orders.sync');
                Session.get('selectedOrderId') !== null;
                toastr.success('Order successfully executed!');
              }).catch((err) => {
                console.log(err);
                toastr.error('Oops, an error has occured. Please verify the transaction informations');
              });
              quantity -= setOfOrders[i].sell.howMuch;
            } else if (quantity < setOfOrders[i].sell.howMuch) {
              coreContract.takeOrder(AddressList.Exchange, setOfOrders[i].id, quantity, { from: managerAddress }).then((result) => {
                console.log(result);
                console.log('Transaction for order id ', setOfOrders[i].id, ' executed!');
                Meteor.call('orders.sync');
                Session.set('selectedOrderId', null);
                toastr.success('Order successfully executed!');
              }).catch((err) => {
                toastr.error('Oops, an error has occured. Please verify the transaction informations');
                console.log(err);
              });
              quantity = 0;
            }
          }
        }
      }
      // Case 1.2 : Take offer -> Trade through manager's wallet
      else {
        console.log('Manager takes an offer for his own wallet');

        // Differenciation case for Ethertokens and ERC20 tokens
        let assetContract;
        if (sellTokenAddress == AddressList.EtherToken) {
          const EtherToken = contract(EtherTokenJson);
          EtherToken.setProvider(web3.currentProvider);
          assetContract = EtherToken.at(sellTokenAddress);
        } else {
          const Asset = contract(AssetJson);
          Asset.setProvider(web3.currentProvider);
          assetContract = Asset.at(sellTokenAddress);
        }

        // Case 1.2.1 : Take offer -> Trade through manager's wallet -> Sell token is EtherToken (not ERC20)
        if (sellTokenAddress == AddressList.EtherToken) {
          for (let i = 0; i < setOfOrders.length; i += 1) {
            if (quantity) {
              // const quantityToApprove = setOfOrders[i]['buy']['howMuch'];
              if (quantity >= setOfOrders[i].sell.howMuch) {
                assetContract.deposit({ from: managerAddress, value: quantityToApprove }).then(result => assetContract.approve(AddressList.Exchange, quantityToApprove, { from: managerAddress })).then(result => exchangeContract.take(setOfOrders[i].id, setOfOrders[i].sell.howMuch, { from: managerAddress })).then((result) => {
                  console.log('Transaction for order id ', setOfOrders[i].id, ' sent!');
                  // Meteor.call('orders.sync');
                  Session.get('selectedOrderId') !== null;
                  toastr.success('Order successfully executed!');
                });
              } else if (quantity < setOfOrders[i].sell.howMuch) {
                assetContract.deposit({ from: managerAddress, value: quantityToApprove }).then(result => assetContract.approve(AddressList.Exchange, quantityToApprove, { from: managerAddress })).then((result) => {
                  exchangeContract.take(setOfOrders[i].id, setOfOrders[i].sell.howMuch, { from: managerAddress });
                }).then((result) => {
                  console.log(result);
                  console.log('Transaction for manager wallet for order id ', setOfOrders[i].id, ' executed!');
                  Meteor.call('orders.sync');
                  Session.set('selectedOrderId', null);
                  toastr.success('Order successfully executed!');
                }).catch((err) => {
                  toastr.error('Oops, an error has occured. Please verify the transaction informations');
                  console.log(err);
                });
                quantity = 0;
              }
            }
          }
        }
        // Case 1.2.2 : Take offer -> Trade through manager's wallet -> Sell token is ERC20
        else {
          for (let i = 0; i < setOfOrders.length; i += 1) {
            if (quantity) {
              // const quantityToApprove = setOfOrders[i]['buy']['howMuch'];
              if (quantity >= setOfOrders[i].sell.howMuch) {
                assetContract.approve(AddressList.Exchange, quantityToApprove, { from: managerAddress }).then(result => exchangeContract.take(setOfOrders[i].id, setOfOrders[i].sell.howMuch, { from: managerAddress })).then((result) => {
                  console.log('Transaction for order id ', setOfOrders[i].id, ' sent!');
                  // Meteor.call('orders.sync');
                  Session.get('selectedOrderId') !== null;
                  toastr.success('Order successfully executed!');
                });
              } else if (quantity < setOfOrders[i].sell.howMuch) {
                assetContract.approve(AddressList.Exchange, quantityToApprove, { from: managerAddress }).then((result) => {
                  exchangeContract.take(setOfOrders[i].id, setOfOrders[i].sell.howMuch, { from: managerAddress });
                }).then((result) => {
                  console.log(result);
                  console.log('Transaction for manager wallet for order id ', setOfOrders[i].id, ' executed!');
                  Meteor.call('orders.sync');
                  Session.set('selectedOrderId', null);
                  toastr.success('Order successfully executed!');
                }).catch((err) => {
                  toastr.error('Oops, an error has occured. Please verify the transaction informations');
                  console.log(err);
                });
                quantity = 0;
              }
            }
          }
        }
      }
    }
  // Case 2: User enters manually order information
    else if (Session.get('selectedOrderId') == null) {
      const type = Template.instance().state.get('buyingSelected') ? 'Buy' : 'Sell';
      const price = parseFloat(templateInstance.find('input.js-price').value, 10);
      const volume = parseFloat(templateInstance.find('input.js-volume').value, 10);
      const total = parseFloat(templateInstance.find('input.js-total').value, 10);
      if (!type || isNaN(price) || isNaN(volume) || isNaN(total)) {
      // TODO replace toast
      // Materialize.toast('Please fill out the form', 4000, 'blue');
        alert('All fields are required.');
        return;
      }

      // Is mining
      Session.set('NetworkStatus', { isInactive: false, isMining: true, isError: false, isMined: false });

      let sellToken;
      let buyToken;
      let sellVolume;
      let buyVolume;

      if (type === 'Buy') {
        sellToken = quoteTokenSymbol;
        sellVolume = total;
        buyToken = baseTokenSymbol;
        buyVolume = volume;
      } else if (type === 'Sell') {
        sellToken = baseTokenSymbol;
        sellVolume = volume;
        buyToken = quoteTokenSymbol;
        buyVolume = total;
      }

    // Get token addresses
      const sellTokenAddress = Specs.getTokenAddress(sellToken);
      const buyTokenAddress = Specs.getTokenAddress(buyToken);
    // Get token precision
      const sellTokenPrecision = Specs.getTokenPrecisionByAddress(sellTokenAddress);
      const buyTokenPrecision = Specs.getTokenPrecisionByAddress(buyTokenAddress);
    // Get base unit volume
      const sellBaseUnitVolume = sellVolume * Math.pow(10, sellTokenPrecision);
      const buyBaseUnitVolume = buyVolume * Math.pow(10, buyTokenPrecision);

      // Case 2.1 : Make offer -> Trade through fund
      if (Session.get('fromPortfolio')) {
        coreContract.makeOrder(
          AddressList.Exchange,
          sellBaseUnitVolume,
          sellTokenAddress,
          buyBaseUnitVolume,
          buyTokenAddress,
          { from: managerAddress },
        ).then((result) => {
          for (let i = 0; i < result.logs.length; i += 1) {
            if (result.logs[i].event === 'OrderUpdate') {
              console.log('Order registered');
              console.log(`Order id: ${result.logs[i].args.id.toNumber()}`);
              Meteor.call('orders.syncOrderById', result.logs[i].args.id.toNumber());
              toastr.success('Order successfully submitted!');
            }
          }
        }).catch((err) => {
          toastr.error('Oops, an error has occured. Please verify your order informations.');
          throw err;
        });
      }
      // Case 2.2 : Make offer -> Trade through manager's wallet
      else {
        console.log('Manager makes offer for his own wallet');
        console.log(sellTokenAddress, AddressList.EtherToken);
        // Differenciation case for Ethertokens and ERC20 tokens
        let assetContract;
        if (sellTokenAddress == AddressList.EtherToken) {
          const EtherToken = contract(EtherTokenJson);
          EtherToken.setProvider(web3.currentProvider);
          assetContract = EtherToken.at(sellTokenAddress);
        } else {
          const Asset = contract(AssetJson);
          Asset.setProvider(web3.currentProvider);
          assetContract = Asset.at(sellTokenAddress);
        }
        // Case 2.2.1 : Make offer -> trade through manager's wallet -> Sell token is Ether token (not ERC20)
        if (sellTokenAddress === AddressList.EtherToken) {
          assetContract.deposit({ from: managerAddress, value: sellBaseUnitVolume }).then((result) => {
            console.log('result from deposit ', result);
            return assetContract.approve(AddressList.Exchange, sellBaseUnitVolume, { from: managerAddress });
          }).then((result) => {
            console.log('result from approve ', result);
            return exchangeContract.make(sellBaseUnitVolume, sellTokenAddress, buyBaseUnitVolume, buyTokenAddress, { from: managerAddress });
          }).then((result) => {
            for (let i = 0; i < result.logs.length; i += 1) {
              if (result.logs[i].event === 'OrderUpdate') {
                console.log('obj ', result.logs[i]);
                console.log('Order registered for manager wallet');
                console.log(`Order id: ${result.logs[i].args.id.toNumber()}`);
                Meteor.call('orders.syncOrderById', result.logs[i].args.id.toNumber());
                toastr.success('Order successfully submitted!');
              }
            }
          }).catch((err) => {
            toastr.error('Oops, an error has occured. Please verify your order informations.');
            throw err;
          });
        }
        // Case 2.2.2 : Make offer -> trade through manager's wallet -> Sell token is ERC20
        else {
          assetContract.approve(AddressList.Exchange, sellBaseUnitVolume, { from: managerAddress }).then((result) => {
            console.log('result from approve ', result);
            return exchangeContract.make(sellBaseUnitVolume, sellTokenAddress, buyBaseUnitVolume, buyTokenAddress, { from: managerAddress });
          }).then((result) => {
            console.log(result);
            toastr.success('Order successfully submitted!');
            for (let i = 0; i < result.logs.length; i += 1) {
              if (result.logs[i].event === 'OrderUpdate') {
                console.log('Order registered for manager wallet');
                console.log(`Order id: ${result.logs[i].args.id.toNumber()}`);
                Meteor.call('orders.syncOrderById', result.logs[i].args.id.toNumber());
                toastr.success('Order successfully submitted!');
              }
            }
          }).catch((err) => {
            toastr.error('Oops, an error has occured. Please verify your order informations.');
            throw err;
          });
        }
      }
    }
  },
});
