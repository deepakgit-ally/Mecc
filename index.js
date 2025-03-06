const express = require('express');
const multer = require('multer');
const path = require('path');
const mssql = require('mssql');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;


// Enable CORS
app.use(cors({ origin: 'http://localhost:3000' }));
// app.use(cors({ origin: 'https://www.arogye.com' }));
app.use(express.json());  // For parsing JSON request bodies

// Serve static files from 'public' directory
// Serve images from 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
 // Serve static files

// Setup multer storage for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');  // Save files to 'uploads' folder
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));  // Generate unique file name
  },
});

const upload = multer({ storage: storage });

const uploadMultiple = upload.array('images', 6);
// MSSQL connection config
const config = {
  user: 'sa',
  password: '123456',
  server: 'DESKTOP-GNJKD9D\\',  // Replace with your SQL Server instance name
  database: 'MeCotton',
  options: { encrypt: true, trustServerCertificate: true },
};

const getProductById = async (productId) => {
  try {
    const query = `
      SELECT 
        p.ProductId, 
        p.Title, 
        p.Description, 
        p.Price, 
        p.CategorieId, 
        c.Name AS Category, 
        p.SubcategoryId, 
        sc.Name AS Subcategory,
        STRING_AGG(pi.ImageUrl, ',') AS Images
      FROM AddProduct p
      LEFT JOIN ProductCategories c ON p.CategorieId = c.Id
      LEFT JOIN SubCategories sc ON p.SubcategoryId = sc.Id
      LEFT JOIN ProductImages pi ON p.ProductId = pi.ProductId
      WHERE p.ProductId = @productId
      GROUP BY p.ProductId, p.Title, p.Description, p.Price, p.CategorieId, c.Name, p.SubcategoryId, sc.Name;
    `;

    const pool = await mssql.connect(config);
    const result = await pool.request().input("productId", mssql.Int, productId).query(query);

    if (result.recordset.length === 0) return null;

    // Convert Images string to an array
    const product = result.recordset[0];
    product.Images = product.Images ? product.Images.split(",") : [];

    return product;
  } catch (error) {
    console.error("Database error:", error);
    return null;
  }
};






// Create a new connection pool for each request
const poolPromise = new mssql.ConnectionPool(config).connect();

// Utility function to get the pool and execute queries
async function executeQuery(query) {
  const pool = await poolPromise;
  return pool.request().query(query);
}

// Signup API Endpoint
app.post('/signup', async (req, res) => {
  const { fullName, phoneNo, email, password } = req.body;

  try {
    await executeQuery(`
      INSERT INTO SingUp (Name, PhoneNo, EmailId, Password)
      VALUES ('${fullName}', '${phoneNo}', '${email}', '${password}')
    `);
    res.status(200).json({ message: 'Signup successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error during signup' });
  }
});

// Login API Endpoint
app.post('/login', async (req, res) => {
  const { phoneNo, password } = req.body;

  try {
    const result = await executeQuery(`
      SELECT * FROM SingUp WHERE PhoneNo = '${phoneNo}' AND Password = '${password}'
    `);

    if (result.recordset.length > 0) {
      res.status(200).json({ message: 'Login successful', user: result.recordset[0] });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error during login' });
  }
});

// Add to Cart API Endpoint
app.post('/cart/add', async (req, res) => {
  const { userId, productId, productName, productPrice } = req.body;

  if (!userId) {
    return res.status(401).json({ message: 'User not logged in' });
  }

  try {
    await executeQuery(`
      INSERT INTO Cart (UserId, ProductId, ProductName, ProductPrice)
      VALUES (${userId}, ${productId}, '${productName}', ${productPrice})
    `);
    res.status(200).json({ message: 'Product added to cart successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error adding product to cart' });
  }
});

// Get Cart Items API Endpoint
app.get('/cart', async (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(401).json({ message: 'User not logged in' });
  }

  try {
    const result = await executeQuery(`
      SELECT * FROM Cart WHERE UserId = ${userId}
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching cart items' });
  }
});

// Delete Cart Item API Endpoint
app.delete('/cart/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await executeQuery(`
      DELETE FROM Cart WHERE Id = ${id}
    `);
    res.status(200).json({ message: 'Item deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error deleting cart item' });
  }
});

// Product Categories API Endpoint
app.post('/api/category', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Category name is required.' });
  }

  try {
    await executeQuery(`
      INSERT INTO ProductCategories (Name)
      VALUES ('${name}')
    `);
    res.status(200).json({ message: 'Category added successfully!' });
  } catch (err) {
    console.error('Error adding category:', err);
    res.status(500).json({ message: 'Error adding category to the database.' });
  }
});

// Orders API Endpoint
app.get('/orders', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(401).json({ message: 'User not logged in' });
  }

  try {
    const result = await executeQuery(`
      SELECT OrderId, ProductName, Quantity, OrderDate, TotalAmount
      FROM OrderDetail
      WHERE UserId = ${userId}
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching orders' });
  }
});

// Place Order API Endpoint
app.post('/OrderDetail/add', async (req, res) => {
  const { userId, address, pincode, phoneNumber, orders } = req.body;

  if (!userId || !address || !pincode || !phoneNumber || !orders) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    await mssql.connect(config);

    const totalAmount = orders.reduce((sum, item) => sum + item.price * item.quantity, 0);

    for (const item of orders) {
      await mssql.query(`
        INSERT INTO OrderDetail 
          (UserId, ProductId, ProductName, Quantity, Price, TotalAmount, Address, Pincode, PhoneNumber) 
        VALUES 
          (${userId}, ${item.productId}, '${item.productName}', ${item.quantity}, 
          ${item.price}, ${totalAmount}, '${address}', '${pincode}', '${phoneNumber}')
      `);
    }

    res.status(201).json({ message: 'Order placed successfully.', totalAmount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to place the order.' });
  } finally {
    mssql.close();
  }
});

// Cancel Order API Endpoint
app.delete('/order/:orderId', async (req, res) => {
  const { orderId } = req.params;

  try {
    const result = await executeQuery(`
      DELETE FROM OrderDetail WHERE OrderId = ${orderId}
    `);

    if (result.rowsAffected[0] > 0) {
      res.status(200).json({ message: 'Order cancelled successfully' });
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error cancelling order' });
  }
});

// Add Product API Endpoint
app.post('/admin/add-product', uploadMultiple, async (req, res) => {
  try {
    const { title, description, price, category, subcategory } = req.body;
    const imagePaths = req.files.map(file => file.path);

    const result = await executeQuery(`
      INSERT INTO AddProduct (Title, Description, Price, CategorieId, SubcategoryId) 
      VALUES ('${title}', '${description}', ${price}, ${category}, ${subcategory});
      SELECT SCOPE_IDENTITY() AS ProductId;
    `);

    const productId = result.recordset[0].ProductId;

    for (let imagePath of imagePaths) {
      await executeQuery(`INSERT INTO ProductImages (ProductId, ImageUrl) VALUES (${productId}, '${imagePath}')`);
    }

    res.status(200).json({ message: 'Product added successfully' });
  } catch (err) {
    console.error('Error adding product:', err);
    res.status(500).json({ message: 'Error adding product' });
  }
});

// Fetch Categories API Endpoint
app.get('/admin/categories', async (req, res) => {
  try {
    // Fetching categories from the database
    const result = await executeQuery('SELECT * FROM ProductCategories');
    res.status(200).json(result.recordset); // Sending back the categories
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ message: 'Error fetching categories.' });
  }
});

// post Categories API Endpoint
app.post('/api/category', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Category name is required.' });
  }

  try {
    // Use parameterized queries for better security
    const query = 'INSERT INTO ProductCategories (Name) VALUES (@name)';
    await executeQuery(query, { name });  // Assuming executeQuery accepts parameters
    res.status(200).json({ message: 'Category added successfully!' });
  } catch (err) {
    console.error('Error adding category:', err);
    res.status(500).json({ message: 'Error adding category to the database.' });
  }
});


// Admin Login API Endpoint
app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await executeQuery(`
      SELECT * FROM Admins WHERE Username = '${username}' AND Password = '${password}'
    `);

    if (result.recordset.length > 0) {
      res.status(200).json({ message: 'Admin logged in successfully' });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error during admin login' });
  }
});

// Fetch Products API Endpoint
app.get('/products', async (req, res) => {
  try {
    const result = await executeQuery(`
      SELECT 
        p.ProductId, 
        p.Title, 
        p.Description, 
        p.Price, 
        p.CategorieId, 
        c.Name AS Category, 
        p.SubcategoryId, 
        sc.Name AS Subcategory,
        pi.ImageUrl 
      FROM AddProduct p
      LEFT JOIN ProductCategories c ON p.CategorieId = c.Id
      LEFT JOIN SubCategories sc ON p.SubcategoryId = sc.Id
      LEFT JOIN ProductImages pi ON p.ProductId = pi.ProductId
    `);

    // Group products with multiple images
    const productMap = {};
    result.recordset.forEach((row) => {
      if (!productMap[row.ProductId]) {
        productMap[row.ProductId] = {
          ProductId: row.ProductId,
          Title: row.Title,
          Description: row.Description,
          Price: row.Price,
          CategorieId: row.CategorieId,
          Category: row.Category,
          SubcategoryId: row.SubcategoryId,
          Subcategory: row.Subcategory,
          Images: [],
        };
      }
      if (row.ImageUrl) {
        productMap[row.ProductId].Images.push(row.ImageUrl);
      }
    });

    res.status(200).json(Object.values(productMap));
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ message: 'Error fetching products.' });
  }
});





// Product details route
app.get("/products/category/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const products = await executeQuery(
      "SELECT * FROM AddProduct WHERE CategorieId = ?",
      [categoryId]
    );

    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put('/api/category/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    await executeQuery('UPDATE ProductCategories SET Name = ? WHERE Id = ?', [name, id]);
    res.status(200).json({ message: 'Category updated successfully!' });
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ message: 'Error updating category.' });
  }
});

app.delete('/api/category/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeQuery('DELETE FROM ProductCategories WHERE Id = @id', [
      { name: 'id', value: id }, // Pass the parameter correctly
    ]);
    res.status(200).json({ message: 'Category deleted successfully!' });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ message: 'Error deleting category.' });
  }
});

app.put('/api/subcategory/:subcategoryId', async (req, res) => {
  const { subcategoryId } = req.params;
  const { name } = req.body;
  try {
    await executeQuery('UPDATE SubCategories SET Name = ? WHERE subcategoryId = ?', [name, subcategoryId]);
    res.status(200).json({ message: 'Subcategory updated successfully!' });
  } catch (err) {
    console.error('Error updating subcategory:', err);
    res.status(500).json({ message: 'Error updating subcategory.' });
  }
});

app.delete('/api/subcategory/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeQuery('DELETE FROM SubCategories WHERE Id = ?', [id]);
    res.status(200).json({ message: 'Subcategory deleted successfully!' });
  } catch (err) {
    console.error('Error deleting subcategory:', err);
    res.status(500).json({ message: 'Error deleting subcategory.' });
  }
});




const sql = require("mssql");

app.get("/products/subcategory/:subcategoryId", async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    console.log("Received SubcategoryId:", subcategoryId);

    // Ensure subcategoryId is a valid integer
    const subcategoryIdInt = parseInt(subcategoryId, 10);
    if (isNaN(subcategoryIdInt)) {
      return res.status(400).json({ message: "Invalid subcategory ID." });
    }

    // Establish DB connection
    const pool = await sql.connect(config);

    // Use parameterized query to prevent SQL injection
    const result = await pool
      .request()
      .input("subcategoryId", sql.Int, subcategoryIdInt) // Bind parameter correctly
      .query(`
      SELECT 
        p.ProductId, 
        p.Title, 
        p.Description, 
        p.Price, 
        p.CategorieId, 
        c.Name AS Category, 
        p.SubcategoryId, 
        sc.Name AS Subcategory,
        pi.ImageUrl 
      FROM AddProduct p
      LEFT JOIN ProductCategories c ON p.CategorieId = c.Id
      LEFT JOIN SubCategories sc ON p.SubcategoryId = sc.Id
      LEFT JOIN ProductImages pi ON p.ProductId = pi.ProductId
      WHERE p.SubcategoryId = @subcategoryId
    `);

    // Process and structure the data properly
    const productsMap = new Map();

    result.recordset.forEach((row) => {
      if (!productsMap.has(row.ProductId)) {
        productsMap.set(row.ProductId, {
          ProductId: row.ProductId,
          Title: row.Title,
          Description: row.Description,
          Price: row.Price,
          CategoryId: row.CategorieId,
          Category: row.Category,
          SubcategoryId: row.SubcategoryId,
          Subcategory: row.Subcategory,
          Images: row.ImageUrl ? [row.ImageUrl] : [],
        });
      } else {
        // If product already exists, push additional image
        const product = productsMap.get(row.ProductId);
        if (row.ImageUrl) {
          product.Images.push(row.ImageUrl);
        }
      }
    });

    // Convert map values to an array
    const products = Array.from(productsMap.values());

    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});









// API to fetch product by ID
app.get("/products/:id", async (req, res) => {
  const productId = parseInt(req.params.id);
  console.log("Received ProductId:", productId);

  if (isNaN(productId)) {
    return res.status(400).json({ error: "Invalid Product ID" });
  }

  try {
    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get Order Details with User Info API Endpoint
app.get('/admin/orderdetail', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(401).json({ message: 'User not logged in' });
  }

  try {
    const result = await executeQuery(`
      select * from orderdetail
join SingUp on SingUp.id=OrderDetail.UserId
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching orders with user details' });
  }
});



// Get Subcategories
app.get('/admin/subcategories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Fetch only subcategories that belong to the selected category
    const result = await executeQuery(`SELECT * FROM SubCategories WHERE CategoryId = ${categoryId}`);
    
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error('Error fetching subcategories:', err);
    res.status(500).json({ message: 'Error fetching subcategories.' });
  }
});


// Add Subcategory
app.post('/api/subcategory', async (req, res) => {
  const { categoryId, name } = req.body;

  if (!categoryId || !name) {
    return res.status(400).json({ message: 'Category ID and Subcategory name are required.' });
  }

  try {
    const query = `
      INSERT INTO SubCategories (CategoryId, Name)
      VALUES (${categoryId}, '${name}')
    `;

    await executeQuery(query);
    res.status(200).json({ message: 'Subcategory added successfully!' });
  } catch (err) {
    console.error('Error adding subcategory:', err);
    res.status(500).json({ message: 'Error adding subcategory to the database.' });
  }
});




// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});








// const express = require('express');
// const cors = require('cors');
// const path = require('path');

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware
// app.use(cors({ origin: 'http://localhost:3000' }));
// app.use(express.json());
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // Function to safely load routes
// const loadRoute = (routePath, routeName) => {
//   try {
//     app.use(routePath, require(routeName));
//     console.log(`✔️ Loaded route: ${routePath}`);
//   } catch (error) {
//     console.error(`❌ Failed to load route ${routeName}:`, error.message);
//   }
// };

// // Routes
// loadRoute('/auth', './routes/auth');
// loadRoute('/cart', './routes/cart');
// loadRoute('/category', './routes/category');
// loadRoute('/order', './routes/order');
// loadRoute('/product', './routes/product');

// // Start Server
// app.listen(port, () => {
//   console.log(`🚀 Server is running on port ${port}`);
// });
