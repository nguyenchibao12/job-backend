// server/routes/authRoutes.js
import express from 'express';
// Import thêm forgotPassword, resetPassword
import { register, login, forgotPassword, resetPassword, updateStudentProfile,updateRecruiterProfile,uploadCompanyImages,deleteCompanyImage, getRecruiterProfileById} from '../controllers/authController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post('/register', register);
router.post('/login', login);
// **** THÊM 2 ROUTE MỚI ****
router.post('/forgot-password', forgotPassword);
// Dùng PUT hoặc POST đều được, :token là URL parameter
router.put('/reset-password/:token', resetPassword);
// **** HẾT PHẦN THÊM ****
router.put(
    '/me/profile', // Dùng /me/profile để chỉ user đang đăng nhập
    protect, 
    restrictTo('student'), // Chỉ cho phép student update profile cá nhân
    updateStudentProfile
);
router.put(
  '/me/recruiter-profile', 
  protect, 
  restrictTo('recruiter'),  // ✅ Chỉ recruiter được phép
  updateRecruiterProfile
);
router.post(
  '/me/company-images', 
  protect, 
  restrictTo('recruiter'),
  uploadCompanyImages
);

// Xóa ảnh công ty
router.delete(
  '/me/company-images', 
  protect, 
  restrictTo('recruiter'),
  deleteCompanyImage
);

// Admin: Xem profile nhà tuyển dụng
router.get(
  '/recruiters/:recruiterId',
  protect,
  restrictTo('admin'),
  getRecruiterProfileById
);

export default router;