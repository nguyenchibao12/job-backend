// server/models/Job.js
import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  company: { type: String, required: true, trim: true },
  logo: { type: String, default: '🏢' },
  location: { type: String, required: true, trim: true },
  salary: { type: String, required: true, trim: true },
  type: { 
    type: String, 
    enum: ['Part-time', 'Flexible', 'Full-time', 'Internship'], 
    required: true, 
    default: 'Part-time' 
  },
  slots: { type: [String], default: [] },
  description: { type: String, required: true },
  requirements: { type: [String], required: true, default: [] },
  benefits: { type: [String], default: [] },
  recruiter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // ✅ THÊM CÁC TRƯỜNG THANH TOÁN
  status: {
    type: String,
    enum: ['PendingPayment', 'PendingApproval', 'Approved', 'Rejected', 'Expired'],
    default: 'PendingPayment', // ✅ Mặc định chờ thanh toán
  },
  
  // Payment info
  packageType: {
    type: String,
    enum: ['1month', '3months'],
    default: '1month', // Gói 1 tháng hoặc 3 tháng
  },
  duration: {
    type: Number,
    default: 1, // Số tháng (1 hoặc 3)
  },
  paymentAmount: {
    type: Number,
    default: 150000, // 150k VND cho gói 1 tháng, 400k cho 3 tháng
  },
  paymentProof: {
    type: String, // URL ảnh biên lai chuyển khoản (base64 hoặc cloud storage URL)
    default: null,
  },
  paymentDate: {
    type: Date,
    default: null,
  },
  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Pending', 'Verified', 'Rejected'],
    default: 'Unpaid',
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
  
  applicantsCount: { type: Number, default: 0 },
  postedDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },

}, { timestamps: true });

jobSchema.index({ title: 'text', company: 'text', description: 'text', location: 'text' });

const Job = mongoose.model('Job', jobSchema);
export default Job;