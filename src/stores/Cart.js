import flux from 'flux-react'
import actions from '../actions'
import constants, {
    db, isEmpty, poip_valid, API_CALLS, 
    APP_SHOW_TOAST, CART, ORDER_API_ERROR, 
    ORDER_API_SUCCESS, ORDER_ITEM_UPDATE, 
    ORDER_SHIPPING_COST} from '../constants'

const Cart = flux.createStore({
    orders: {},
    customer: {},
    shipping_methods: [],
    shipping_method: {},
    shipping_cost: '0.00',
    order_created: null,
    pending_order_is_paid: false,

    actions: [
        actions.addToCart,
        actions.checkout,
        actions.deleteOrder,
        actions.getShippingMethods,
        actions.removeFromCart,
        actions.reset,
        actions.savePaymentDetails,
        actions.setShippingMethod,
        actions.updateQty,
    ],

    addToCart: function(item) {
        if (!!this.order_created) {
            this.emit('app.toast', {id: APP_SHOW_TOAST, type: 'w', msg: "You have a pending order, please complete it to place another order"})
            return
        }
        if (!!this.orders[item.id]) this.orders[item.id].qty++
        else this.orders[item.id] = { product: item, qty: 1 }
        this.persist()
        this.emit('order.add', {id: ORDER_ITEM_UPDATE, item_id: item.id})
    },

    removeFromCart: function(item) {
        if (!!this.order_created) {
            this.emit('app.toast', {id: APP_SHOW_TOAST, type: 'w', msg: "You have a pending order, please complete it to place another order"})
            return
        }
        if (!!this.orders[item.id]) {
            if (this.orders[item.id].qty == 1) delete this.orders[item.id]
            else this.orders[item.id].qty--
            this.persist()
            this.emit('order.remove', {id: ORDER_ITEM_UPDATE, item_id: item.id})
        }
    },

    deleteOrder: function(id) {
        if (!!this.order_created) {
            this.emit('app.toast', {id: APP_SHOW_TOAST, type: 'w', msg: "You have a pending order, please complete it to place another order"})
            return
        }
        delete this.orders[id]
        this.persist()
        this.emit('order.delete', {id: ORDER_ITEM_UPDATE, item_id: id}) // products depend on this is to update their state
    },

    updateQty: function(id, qty) {
        if (!!this.order_created) {
            this.emit('app.toast', {id: APP_SHOW_TOAST, type: 'w', msg: "You have a pending order, please complete it to place another order"})
            return
        }
        if (this.orders[id]) {
            this.orders[id].qty = qty
            this.persist()
            this.emit('order.qty', {id: ORDER_ITEM_UPDATE, item_id: id})
        }
    },

    getLineItems() {
        const line_items = []
        for (let o in this.orders) {
            line_items.push({
                product_id: o,
                quantity: this.orders[o].qty
            })
        }
        return line_items;
    },

    checkout: async function(cust_data, isPaid = false) {
        if (!!this.order_created) {
            // order already created, so on with it!
            this.emit('order.api-response', {id: ORDER_API_SUCCESS, response: {id: this.order_created}, isPaid})
            return true
        }

        this.customer = { ...this.customer, ...cust_data }
        const {customer} = this
        const [first_name, last_name] = customer['checkout.clientname'].split(' ', 2)
        const billing = {
            first_name,
            last_name: last_name || '',
            email: customer['checkout.email'],
            phone: customer['checkout.phone'],
            address_1: customer['map.searchbox.update'],
            state: 'LOS',
            city: 'Lagos',
            country: 'NG',
        }
        const payload = {
            payment_method_title: isPaid? 'Paystack Online Payment':'Cash on delivery',
            payment_method: isPaid? 'paystack':'cod',
            // payment_method_title: 'Direct Bank Transfer',
            set_paid: false,
            billing: {...billing},
            shipping: {...billing},
            line_items: this.getLineItems(),
            shipping_lines: [
                {
                    method_id: this.shipping_method.method,
                    method_title: this.shipping_method.desc,
                    total: this.shipping_cost,
                }
            ]
        }
        // const payload = {...constants.sample_order, line_items: this.getLineItems()}
        try {
            const response = await API_CALLS.createOrder(payload)
            this.orderCreated(response.data.id)
            // console.log(response)
            this.emit('order.api-response', {id: ORDER_API_SUCCESS, response, isPaid})
            if (!isPaid) this.markOrderAsPaid()
        } catch (ex) {
            this.emit('order.api-error', {id: ORDER_API_ERROR, ex})
        }
    },

    getShippingMethods: async function() {
        try {
            const response = await API_CALLS.getShippingMethods()
            this.shipping_methods = []
            response.map(method => this.shipping_methods.push({
                method: method.id,
                desc: method.description
            }))
            // this.emit('shipping.methods-arrive')
        } catch (x) {}
    },

    setShippingMethod: function(data) {
        if (!!this.order_created) {
            this.emit('app.toast', {id: APP_SHOW_TOAST, type: 'w', msg: "You have a pending order, please complete it to place another order"})
            return
        }
        this.shipping_method = data
        this.shipping_cost = data.cost
        this.emit('order.shipping_cost', {id: ORDER_SHIPPING_COST, cost: data.cost})
    },

    persist: function(which = 'orders') {
        db.put(CART.DB_KEY_ORDERS, this.orders)
    },

    orderCreated: function(id) {
        this.order_created = id
        db.put(CART.DB_KEY_NEW_ORDER_ID, id)
        db.put(CART.DB_KEY_CUSTOMER_DATA, this.customer)
        this.emit('app.order-created')
    },

    reset: function() {
        db.clear()
        
        this.orders = {}
        this.customer = {}
        this.shipping_methods = []
        this.shipping_method = {}
        this.shipping_cost = '0.00'
        this.order_created = null

        this.emit('order.reset')
        this.emit('cart.reset')
    },

    // call this method without data to work with already existing data
    savePaymentDetails: async function(data) {
        if (!!data) {
            await db.put(CART.DB_KEY_PAYMENT_DATA, data)
            this.pending_order_is_paid = true
            this.markOrderAsPaid()
        } else {
            if (poip_valid(await db.get(CART.DB_KEY_PAYMENT_DATA))) this.markOrderAsPaid()
        }
    },

    markOrderAsPaid: function() {
        this.emit('app.toast', {id: APP_SHOW_TOAST, type: 's', msg: "Order complete! Thank you."})
        this.reset()
    },

    exports: {
        /**
         * Load data important to the cart
         */
        load: async function() {
            this.orders = await(db.get(CART.DB_KEY_ORDERS)) || {}
            this.emit('order.loaded')
            this.order_created = await(db.get(CART.DB_KEY_NEW_ORDER_ID))
            this.customer = await(db.get(CART.DB_KEY_CUSTOMER_DATA)) || {}
            this.emit('app.order-created')
            this.pending_order_is_paid = poip_valid(await db.get(CART.DB_KEY_PAYMENT_DATA))
        },

        /**
         * Gets the quantity ordered, of specified item
         */
        getQty: function(id) {
            return !!this.orders[id]? this.orders[id].qty:0
        },

        /**
         * Is the cart empty?
         */
        isEmpty: function() {
            return isEmpty(this.orders)
        },

        /**
         * Pretty straightforward
         */
        getTotal: function(order_total = false) {
            let total = 0
            isEmpty(this.orders)? 0:Object.keys(this.orders).map((o) => {
                total += (this.orders[o].qty * this.orders[o].product.price)
            })
            return total + (!order_total? +this.shipping_cost:0);
        },

        /**
         * Pretty straightforward
         */
        getAllOrders: function() {
            return Object.values(this.orders)
        },

        /**
         * Exposes available shipping methods
         */
        getShippingMethods: function() {
            return this.shipping_methods
        },

        /**
         * Exposes shipping cost
         */
        getShippingCost: function() {
            return this.shipping_cost
        },

        /**
         * Tell if order is created
         */
        isOrderCreated: function() {
            return this.order_created
        },

        /**
         * Pretty straightforward
         */
        getCustomer: function() {
            return this.customer
        },

        /**
         * Pretty straightforward
         */
        pendingOrderIsPaid: function() {
            return this.pending_order_is_paid
        }
    }
})

export default Cart