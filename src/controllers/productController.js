const Product = require('../models/Product');

// Public: Get all active products with search & filter
const getProducts = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, page = 1, limit = 10 } = req.query;

    let query = { is_active: true };

    if (category) query.category = category;
    if (search) query.name = { $regex: search, $options: 'i' };
    if (minPrice || maxPrice) {
      query.unit_price = {};
      if (minPrice) query.unit_price.$gte = Number(minPrice);
      if (maxPrice) query.unit_price.$lte = Number(maxPrice);
    }

    const products = await Product.find(query)
      .populate('supplier', 'company_name email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(query);

    return res.status(200).json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalProducts: total
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
};

// Protected (Supplier Only): Create a new product listing
const createProduct = async (req, res) => {
  try {
    const { name, chemical_formula, category, unit_price, available_stock, purity_grade } = req.body;

    const newProduct = await Product.create({
      supplier: req.user.id, // Set from JWT token (Step 3 middleware)
      name,
      chemical_formula,
      category,
      unit_price,
      available_stock,
      purity_grade
    });

    return res.status(201).json({
      message: "Product listing created successfully",
      product: newProduct
    });
  } catch (error) {
    console.error("Error creating product:", error);
    return res.status(500).json({ error: "Failed to create product listing" });
  }
};

module.exports = { getProducts, createProduct };
