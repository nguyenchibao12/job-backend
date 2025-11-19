// server/models/Application.js
import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  // Tham chiếu đến Job mà sinh viên ứng tuyển
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Đơn ứng tuyển phải thuộc về một công việc.'],
  },
  // Tham chiếu đến User là sinh viên ứng tuyển
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Đơn ứng tuyển phải thuộc về một sinh viên.'],
  },
  // Tham chiếu đến User là nhà tuyển dụng sở hữu Job
  recruiter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Đơn ứng tuyển phải liên kết với nhà tuyển dụng.'],
  },
  // Ngày sinh viên nộp đơn
  applicationDate: {
    type: Date,
    default: Date.now,
  },
  // Trạng thái của đơn ứng tuyển
  status: {
    type: String,
    enum: ['Submitted', 'Viewed', 'Shortlisted', 'Rejected', 'Interviewing', 'Hired'],
    default: 'Submitted',
  },
  // ✅ THÊM: Thư xin việc / Cover Letter
  coverLetter: {
    type: String,
    default: '',
  },
  // ✅ THÊM: Link CV snapshot (nếu cần lưu CV tại thời điểm ứng tuyển)
  cvSnapshotLink: {
    type: String,
    default: '',
  },
  // ✅ THÊM: Ghi chú của recruiter
  recruiterNotes: {
    type: String,
    default: '',
  },

}, { timestamps: true });

// Index unique để đảm bảo sinh viên không ứng tuyển trùng lặp
applicationSchema.index({ job: 1, student: 1 }, { unique: true, background: true });

const Application = mongoose.model('Application', applicationSchema);

export default Application;