import express from 'express';
import {
  createBlog,
  getAllApprovedBlogs,
  getBlogById,
  getPendingBlogs,
  updateBlogStatus,
  getMyBlogs,
  deleteBlog,
} from '../controllers/blogController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// ========================================
// PUBLIC ROUTES
// ========================================
router.get('/', getAllApprovedBlogs);
router.get('/:blogId', getBlogById);

// ========================================
// PROTECTED ROUTES
// ========================================
// Admin và Recruiter có thể tạo blog
router.post(
  '/',
  protect,
  restrictTo('admin', 'recruiter'),
  createBlog
);

// Admin và Recruiter có thể xem blog của mình
router.get(
  '/my/blogs',
  protect,
  restrictTo('admin', 'recruiter'),
  getMyBlogs
);

// Admin có thể xem blog chờ duyệt
router.get(
  '/admin/pending',
  protect,
  restrictTo('admin'),
  getPendingBlogs
);

// Admin có thể duyệt/từ chối blog
router.put(
  '/:blogId/status',
  protect,
  restrictTo('admin'),
  updateBlogStatus
);

// Tác giả hoặc Admin có thể xóa blog
router.delete(
  '/:blogId',
  protect,
  restrictTo('admin', 'recruiter'),
  deleteBlog
);

export default router;

