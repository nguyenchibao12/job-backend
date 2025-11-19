import express from 'express';
import { 
  createJob,
  getPendingJobs,
  updateJobStatus,
  getAllApprovedJobs,
  getJobsByRecruiter,
  deleteJob,
  getJobById,
  uploadPaymentProof, // ✅ THÊM
  getTransactionHistory, // ✅ THÊM
} from '../controllers/jobController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// ========================================
// PUBLIC ROUTES
// ========================================
router.get('/', getAllApprovedJobs);

// ========================================
// SPECIFIC ROUTES (TRƯỚC dynamic routes!)
// ========================================
router.get('/my', protect, restrictTo('recruiter'), getJobsByRecruiter);
router.get('/pending', protect, restrictTo('admin'), getPendingJobs);
router.get('/transactions', protect, restrictTo('admin'), getTransactionHistory); // ✅ THÊM ROUTE LỊCH SỬ GIAO DỊCH

// ========================================
// DYNAMIC ROUTES
// ========================================
router.get('/:jobId', getJobById);
router.put('/:jobId/status', protect, restrictTo('admin'), updateJobStatus);
router.put('/:jobId/payment', protect, restrictTo('recruiter'), uploadPaymentProof); // ✅ THÊM ROUTE UPLOAD
router.delete('/:jobId', protect, restrictTo('admin', 'recruiter'), deleteJob);

// ========================================
// POST ROUTES
// ========================================
router.post('/', protect, restrictTo('recruiter'), createJob);

export default router;