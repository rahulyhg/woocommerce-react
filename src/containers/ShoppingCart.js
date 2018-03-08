import React from 'react'
import {Cart} from '../stores'
import actions from '../actions'
import { CartIcon, Checkout, Map, OrderList, View } from '../components'
import {bindToThis, kformat, ORDER_API_ERROR, ORDER_API_SUCCESS, ORDER_SHIPPING_COST} from '../constants'

const NEUTRAL = 0
const ORDER_PREVIEW = 1
const PICK_LOCATION = 2
const FILL_CHECKOUT_FORM = 3

export default class ShoppingCart extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            isEmpty: Cart.isEmpty(),
            order_total: Cart.getTotal(true),
            total: Cart.getTotal(),
            state: NEUTRAL,
            mapCenter: null,
            mapSearchBox: null,
            userLocation: '',
            shippingMethods: Cart.getShippingMethods(),
            shippingCost: '0.00',
            customer: Cart.getCustomer(),
        }

        // bind
        bindToThis(this, 'updateState')
        bindToThis(this, 'openCart')
        bindToThis(this, 'actionHandler')
        bindToThis(this, 'processPayment')
    }
    componentWillMount() {
        Cart.on('order.*', this.updateState)
        Cart.on('app.order-created', this.updateState)
    }
    componentWillUnmount() {
        Cart.off('order.*', this.updateState)
        Cart.off('app.order-created', this.updateState)
    }
    updateState(d) {
        this.setState({
            isEmpty: Cart.isEmpty(),
            order_total: Cart.getTotal(true),
            total: Cart.getTotal(),
            customer: Cart.getCustomer(),
        })

        // Order received
        if (!!d && !!d.id) {
            switch (d.id) {
                case ORDER_API_ERROR:
                    console.log(d.ex)
                    this.actionHandler('app.busy', false)
                    this.actionHandler('toast.show', { msg: 'Error creating order, please try again' })
                    break;
                case ORDER_API_SUCCESS:
                    if (!d.isPaid) {
                        this.actionHandler('app.busy', false)
                        this.actionHandler('toast.show', { msg: 'Order received!', type: 's' })
                    }
                    else this.processPayment()
                    break;
                case ORDER_SHIPPING_COST:
                    this.setState({ shippingCost: d.cost })
                    break;
            }
        }
    }
    updateShippingMethods() {
        this.updateState({
            shippingMethods: Cart.getShippingMethods()
        })
    }
    processPayment() {
        this.actionHandler('toast.show', { msg: 'Order received, loading payment gateway, please wait', type: 's' })
        this.paystackBtn.pay()
    }
    actionHandler(type, data) {
        switch (type) {
            case 'order.checkout.pick_location':
            case 'checkout.dismiss':
                if (this.props.readonly) {
                    this.setState({ state: NEUTRAL })
                    return
                }
                this.setState({ state: PICK_LOCATION })
                break;
            case 'cart.dismiss':
                this.setState({ state: NEUTRAL })
                break;
            case 'order.qty.change':
                actions.updateQty(data.id, data.value)
                break;
            case 'order.delete':
                actions.deleteOrder(data.id)
                break;
            case 'location.dismiss':
                this.openCart()
                break;
            case 'map.center':
                this.setState({mapCenter: data})
                this.state.mapSearchBox && this.setState({userLocation: this.state.mapSearchBox.value || ''})
                break;
            case 'map.searchbox.update':
                this.setState({mapSearchBox: data})
                break;
            case 'map.destination.meta':
                this.setState({
                    mapDestinationDistance: data.distance,
                    mapDestinationDuration: data.duration,
                    mapDirectionEndAddress: data.end_address,
                })
                data.end_address && this.setState({userLocation: data.end_address})
                break;
            case 'order.checkout':
                this.setState({ state: FILL_CHECKOUT_FORM })
                break;
            case 'checkout.pay':
                actions.checkout(data, true)
                break;
            case 'checkout.finish':
                actions.checkout(data)
                break;
            case 'get.shipping.methods':
                actions.getShippingMethods()
                break;
            case 'set.shipping.method':
                actions.setShippingMethod(data)
                break;
            case 'set.paystack.btn':
                this.paystackBtn = data
                break;
            case 'payment.closed':
                this.actionHandler('app.busy', false)
                this.actionHandler('toast.show', {msg: 'Payment could not be completed, please complete payment to expedite your order', type: 'w'})
                break;
            case 'payment.response':
                this.actionHandler('app.busy', false)
                this.actionHandler('toast.show', { msg: 'Payment complete!', type: 's' })
                break;
            default:
                this.props.actionHandler && this.props.actionHandler(type, data)
                break;
        }
    }
    openCart() {
        this.setState({ state: this.props.readonly? FILL_CHECKOUT_FORM:ORDER_PREVIEW })
    }
    render() {
        let view = null
        switch (this.state.state) {
            case ORDER_PREVIEW:
                view = <OrderList items={Cart.getAllOrders()}
                        actionHandler={this.actionHandler}
                        shipping={this.state.shippingCost}
                        orderTotal={this.state.order_total}
                        total={this.state.total} />
                break;
            case PICK_LOCATION:
                view = <Map actionHandler={this.actionHandler}
                            center={this.state.mapCenter}
                            lastLocation={this.state.userLocation}
                            distance={this.state.mapDestinationDistance}
                            duration={this.state.mapDestinationDuration}
                            etaAddy={this.state.mapDirectionEndAddress} />
                break;
            case FILL_CHECKOUT_FORM:
                view = <Checkout actionHandler={this.actionHandler}
                            location={this.state.userLocation}
                            shippingCost={this.state.shippingCost}
                            total={this.state.total}
                            fieldDefaults={this.state.customer}
                            readonly={this.props.readonly}
                            order_id={Cart.isOrderCreated()} />
                break;
            default:
                view = !this.state.isEmpty?
                    <CartIcon clickHandler={this.openCart} total={kformat(this.state.total)} />:null
                break;
        }
        return <View>
            <div className="ShoppingCart">
                {view}
                {this.state.state? <div className="blankette"></div>:null}
            </div>
            {/* styles */}
            <style jsx>{`
                @media screen and (min-width: 500px) {
                    .blankette {
                        height: 60vh;
                    }
                }
            `}</style>
        </View>
    }
}