const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.anvyz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    console.log("AUTH", authHeader)
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    // console.log("Token holo", token)
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })

        }
        req.decoded = decoded
        console.log(req.decoded)
        next();
    });

}


async function run() {
    try {
        await client.connect();
        const productCollection = client.db('little-leaf').collection('products');
        const cartCollection = client.db('little-leaf').collection('carts');
        const userCollection = client.db('little-leaf').collection('users');

        // put user by email endpoint
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token });
        })

        // get api for products
        app.get('/product', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const products = await cursor.toArray();
            res.send(products);
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


        //for update quantity in cart //http://localhost:5000/carts/:id
        app.patch('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const cart = req.body
            console.log(cart)
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
        app.get('/carts', async (req, res) => {
            const query = {};
            const cursor = cartCollection.find(query);
            const carts = await cursor.toArray();
            res.send(carts);
        });

        //cancel or delete cart order
        //http://localhost:5000/carts/:id

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
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