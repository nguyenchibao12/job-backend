import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import applicationRoutes from './routes/applicationRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import cloudinary from 'cloudinary';

// --- Load biến môi trường ---
dotenv.config();

// --- Kết nối Database ---
connectDB();

// --- Cấu hình Cloudinary ---
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
// --- Test Cloudinary ---
cloudinary.v2.api.ping()
  .then(result => console.log("✅ Cloudinary connected:", result))
  .catch(err => console.error("❌ Cloudinary connection failed:", err));
const app = express();

// --- Middlewares ---
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', // FE chạy ở đây
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/blogs', blogRoutes);

// --- Start server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
