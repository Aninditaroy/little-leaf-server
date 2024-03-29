const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// middleware
app.use(cors());
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header('Access-Control-Allow-Methods', 'DELETE, PUT, GET, POST');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.anvyz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    // console.log('auth header hellooo', authHeader);
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
    // console.log('hello token', token)
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    })
}


async function run() {
    try {
        await client.connect();
        const productCollection = client.db('little-leaf').collection('products');
        const cartCollection = client.db('little-leaf').collection('carts');
        const userCollection = client.db('little-leaf').collection('users');
        const orderCollection = client.db('little-leaf').collection('orders');
        const blogCollection = client.db('little-leaf').collection('blogs');
        const reviewCollection = client.db('little-leaf').collection('reviews');
        const orderItemsCollection = client.db('little-leaf').collection('orderItems');



        //middleware
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        app.post("/create-payment-intent", async (req, res) => {
            const service = req.body;
            const price = service.price;
            //convert to poysha
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })

        })

        //find all admin 
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user?.role === 'admin';
            res.send({ admin: isAdmin })
        })



        // // get admin
        // app.get('/user/:email', async (req, res) => {
        //     const email = req.params.email;
        //     console.log('got this email', email)
        //     const user = await userCollection.findOne({ email: email });
        //     const isAdmin = user.role === 'admin';
        //     res.send({ admin: isAdmin })
        // })

        // put user by email endpoint

        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            // console.log('got this email', email)
            const user = req.body;
            // console.log('got this user', user)
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '2d' });
            res.send({ result, token });
        })


        //make an user admin and check admin

        app.put('/users/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                // paid: true,
                // transactionId: payment.transectionId,
                $set: { role: 'admin' }
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result)

        })


        // get all users
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })


        // get api for products
        // app.get('/product', async (req, res) => {
        //     console.log('query', req.query)
        //     const query = {};
        //     const cursor = productCollection.find(query);
        //     const products = await cursor.toArray();
        //     res.send(products);
        // });
        // get api for products
        app.get('/product', async (req, res) => {
            // console.log('query', req.query)
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);

            const query = {};
            const cursor = productCollection.find(query);
            let products
            if (page || size) {
                products = await cursor.skip(page * size).limit(size).toArray();
            }
            else {
                products = await cursor.toArray();
            }

            res.send(products);
        });

        //for page count

        app.get('/productCount', async (req, res) => {
            const count = await productCollection.estimatedDocumentCount();
            res.send({ count });
        });




        // get api with id for product
        app.get('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const product = await productCollection.findOne(query);
            res.send(product);
        })

        // post api for cart  //http://localhost:5000/cart
        app.post('/cart', async (req, res) => {
            const cart = req.body;
            const result = await cartCollection.insertOne(cart);
            res.send(result);
        })

        //Admin Works add new product

        app.post('/product', verifyJWT, verifyAdmin, async (req, res) => {
            const product = req.body;
            // console.log(product)
            const result = await productCollection.insertOne(product);
            res.send(result);
        })

        //cancel or delete products from manage product
        //http://localhost:5000/product/:id

        app.delete('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productCollection.deleteOne(query);
            res.send(result);
        })

        //update products from manage product
        //http://localhost:5000/product/:id
        app.patch('/product/:id', async (req, res) => {
            const id = req.params.id;
            const updatedProduct = req.body;
            // console.log(updatedProduct)
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    plantName: updatedProduct.plantName,
                    price: updatedProduct.price,
                    inStock: updatedProduct.inStock,
                    description: updatedProduct.description,
                    imageUrl: updatedProduct.imageUrl,
                    imageAlt: updatedProduct.imageAlt,
                    categories: updatedProduct.categories,
                },
            };
            const result = await productCollection.updateOne(filter, updateDoc, options);
            res.send(result)
        })





        //for update quantity in cart //http://localhost:5000/carts/:id
        app.patch('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const cart = req.body
            // console.log(cart)
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    quantity: cart.quantity,

                }
            };
            const updatedOrder = await cartCollection.updateOne(filter, updateDoc)
            res.send(updateDoc)

        })




        // get api for carts
        app.get('/carts/:email', async (req, res) => {
            const email = req.params.email;
            // console.log(email)
            const filter = { email: email };
            const cursor = cartCollection.find(filter);
            const carts = await cursor.toArray();
            res.send(carts);
        })

        //cancel or delete cart order
        //http://localhost:5000/carts/:id

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        ///for stripe test
        app.get('/cart/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const order = await cartCollection.findOne(query);
            res.send(order);
        })

        // remove carts
        app.delete('/carts', async (req, res) => {
            const result = await cartCollection.remove({});
            res.send(result);
        })


        // get all  orders from  manageorders 
        // app.get('/orders', async (req, res) => {
        //     const users = await orderCollection.find().toArray();
        //     res.send(users);
        // })


        app.get('/orders', async (req, res) => {

            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);

            const query = {};
            const cursor = orderCollection.find(query);
            let orders
            if (page || size) {
                orders = await cursor.skip(page * size).limit(size).toArray();
            }
            else {
                orders = await cursor.toArray();
            }

            res.send(orders);

            // const users = await orderCollection.find().toArray();
            // res.send(users);
        })

        //order collection page count
        app.get('/productCountOrder', async (req, res) => {
            const count = await orderCollection.estimatedDocumentCount();
            res.send({ count });
        });



        // post paid  orders from  checkout form  
        app.post('/orders', async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result);
        })
        // post paid  orders items from  checkout form  
        app.post('/orderItem', async (req, res) => {
            const order = req.body;
            const result = await orderItemsCollection.insertOne(order);
            res.send(result);
        })

        // manage order shipped property
        app.put('/manageorder/:id', async (req, res) => {
            const id = req.params.id;
            const order = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: { pendingChange: 'shipped' }
            };
            const result = await orderCollection.updateOne(filter, updateDoc, options);

            res.send(result)

        })

        // After successful payment instock updation
        app.patch('/products/:id', async (req, res) => {
            const id = req.params.id;
            const product = req.body
            // console.log(cart)
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    inStock: product.inStock,
                }
            };
            const updatedOrder = await productCollection.updateOne(filter, updateDoc)
            res.send(updateDoc)

        })

        //  get api my orders with email for user
        app.get('/myorders/:email', async (req, res) => {
            const email = req.params.email;
            // console.log(email)
            const filter = { userEmail: email };
            const orders = await orderCollection.find(filter).toArray();
            res.send(orders);
        })

        //  get api my orders with email for user
        app.get('/myorderitems/:transectionId', async (req, res) => {
            const reqTransectionId = req.params.transectionId;
            // console.log(email)
            const filter = { transectionId: reqTransectionId };
            const orderItem = await orderItemsCollection.find(filter).toArray();
            res.send(orderItem);
        })

        // add new blog by admin
        app.post('/blogs', verifyJWT, verifyAdmin, async (req, res) => {
            const blogs = req.body;
            // console.log(blog)
            const result = await blogCollection.insertOne(blogs);
            res.send(result);
        })

        // get all blog by admin
        app.get('/blogs', async (req, res) => {
            const blogs = await blogCollection.find().toArray();
            res.send(blogs);
        })
        // get api with id for blog
        app.get('/blog/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const blog = await blogCollection.findOne(query);
            res.send(blog);
        })

        // add review by user for every product
        app.post('/reviews', async (req, res) => {
            const reviews = req.body;
            const result = await reviewCollection.insertOne(reviews);
            res.send(result);
        })

        // get all reviews by user for every product
        app.get('/review', async (req, res) => {
            // const reqId = req.params.reviewId;
            // console.log(reqId)
            // const filter = { productId: reqId };
            // const reviews = await reviewCollection.find(filter).toArray();
            // res.send(reviews);
            const reviews = await reviewCollection.find().toArray();
            res.send(reviews);
        })


    }
    finally {

    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from Little Leaf!');
})

app.listen(port, () => {
    console.log(`Little Leaf listening on port ${port}`)
})