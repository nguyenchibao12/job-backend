import express from 'express';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import { 
  createApplication, 
  getApplicationsForJob, 
  updateApplicationStatus,
  getMyApplications 
} from '../controllers/applicationController.js';

const router = express.Router();

// ========================================
// STUDENT ROUTES
// ========================================

// POST /api/applications - Sinh viên nộp đơn ứng tuyển
router.post('/', protect, restrictTo('student'), createApplication);

// GET /api/applications/my - Sinh viên xem các đơn đã nộp
// ⭐ QUAN TRỌNG: Route này phải đặt TRƯỚC /job/:jobId
router.get('/my', protect, restrictTo('student'), getMyApplications);


// ========================================
// RECRUITER ROUTES
// ========================================

// GET /api/applications/job/:jobId - Nhà tuyển dụng xem ứng viên cho 1 job
// ⭐ Route này phải đặt SAU /my
router.get('/job/:jobId', protect, restrictTo('recruiter'), getApplicationsForJob);

// PUT /api/applications/:applicationId/status - Nhà tuyển dụng cập nhật trạng thái đơn
router.put('/:applicationId/status', protect, restrictTo('recruiter'), updateApplicationStatus);


export default router;