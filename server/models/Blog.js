// server/models/Blog.js
import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true, 
    maxlength: 200 
  },
  excerpt: { 
    type: String, 
    required: true, 
    trim: true, 
    maxlength: 500 
  },
  content: { 
    type: String, 
    required: true 
  },
  image: { 
    type: String, 
    default: '📝' // Emoji hoặc URL ảnh
  },
  category: { 
    type: String, 
    required: true,
    enum: ['Hướng dẫn', 'Kinh nghiệm', 'Tin tức', 'Tips', 'Khác'],
    default: 'Khác'
  },
  readTime: { 
    type: String, 
    default: '5 phút' 
  },
  
  // Tác giả
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // Trạng thái duyệt
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending', // Mặc định chờ duyệt
  },
  
  // Admin review
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  rejectionReason: {
    type: String,
    default: null,
  },
  
  // Thống kê
  views: { 
    type: Number, 
    default: 0 
  },
  likes: { 
    type: Number, 
    default: 0 
  },
  
  publishedAt: { 
    type: Date, 
    default: null 
  },
  
}, { timestamps: true });

blogSchema.index({ title: 'text', content: 'text', excerpt: 'text' });
blogSchema.index({ status: 1, publishedAt: -1 });

const Blog = mongoose.model('Blog', blogSchema);
export default Blog;

