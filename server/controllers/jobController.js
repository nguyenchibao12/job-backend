import Job from '../models/Job.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import Application from '../models/Application.js';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import cloudinary from 'cloudinary';

// ========================================
// 🔧 NODEMAILER TRANSPORTER (Dùng chung)
// Tạo 1 lần và tái sử dụng, thay vì tạo mới trong mỗi hàm
// ========================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ========================================
// CREATE JOB - Tạo tin tuyển dụng
// ========================================
export const createJob = async (req, res) => {
  const recruiterId = req.user?.id;
  const { 
    title, company, logo, location, salary, type, slots, 
    description, requirements, benefits 
  } = req.body;

  console.log(`📝 Create job request from recruiter: ${recruiterId}`);

  if (!recruiterId) {
    return res.status(401).json({ message: "Không xác thực được nhà tuyển dụng." });
  }
  
  if (!title || !company || !location || !salary || !type || !description || !requirements) {
    return res.status(400).json({ message: "Vui lòng điền đầy đủ các trường bắt buộc." });
  }

  try {
    // Mặc định packageType là 1month nếu không có
    const packageType = req.body.packageType || '1month';
    const packageInfo = {
      '1month': { amount: 150000, duration: 1 },
      '3months': { amount: 400000, duration: 3 }
    };
    const packageData = packageInfo[packageType] || packageInfo['1month'];

    const newJob = new Job({
      ...req.body,
      recruiter: recruiterId,
      status: 'PendingPayment',
      paymentStatus: 'Unpaid',
      packageType: packageType,
      duration: packageData.duration,
      paymentAmount: packageData.amount,
      applicantsCount: 0,
      postedDate: Date.now()
    });

    const savedJob = await newJob.save();
    console.log("✅ Job created with status PendingPayment:", savedJob._id);

    res.status(201).json({ 
      message: "Tạo tin thành công! Vui lòng thanh toán để Admin duyệt tin.",
      job: savedJob,
      nextStep: "payment"
    });

  } catch (error) {
    console.error("❌ Error creating job:", error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: "Lỗi máy chủ khi tạo công việc.", error: error.message });
  }
};

// ========================================
// ⭐️ ADD: UPDATE JOB - Recruiter cập nhật tin
// ========================================
export const updateJob = async (req, res) => {
  const { jobId } = req.params;
  const recruiterId = req.user.id;

  console.log(`📝 Recruiter ${recruiterId} updating job ${jobId}`);

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return res.status(400).json({ message: "ID công việc không hợp lệ." });
  }

  try {
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy công việc." });
    }

    if (job.recruiter.toString() !== recruiterId) {
      return res.status(403).json({ message: "Bạn không có quyền sửa công việc này." });
    }

    if (job.status === 'PendingApproval') {
      return res.status(400).json({ 
        message: "Không thể sửa tin khi đang chờ Admin duyệt. Vui lòng đợi." 
      });
    }
    
    Object.assign(job, req.body);

    let message = "Cập nhật tin thành công.";

    if (job.status === 'Rejected') {
      job.status = 'PendingPayment';
      job.paymentStatus = 'Unpaid';
      job.paymentProof = undefined;
      job.rejectionReason = undefined;
      job.reviewedBy = undefined;
      job.reviewedAt = undefined;
      message = "Cập nhật thành công. Vui lòng thanh toán lại để duyệt tin.";
    }
    
    if (job.status === 'Approved') {
      job.status = 'PendingApproval';
      job.reviewedBy = undefined;
      job.reviewedAt = undefined;
      message = "Cập nhật thành công. Tin của bạn đã được gửi lại cho Admin duyệt.";
      
      try {
        await transporter.sendMail({
          from: `"StudentWork - Admin Notification" <${process.env.EMAIL_USERNAME}>`,
          to: process.env.ADMIN_EMAIL || process.env.EMAIL_USERNAME,
          subject: '⚠️ Tin tuyển dụng đã duyệt vừa bị sửa',
          html: `
            <p>Tin <strong>${job.title}</strong> (ID: ${jobId}) đã được duyệt trước đó vừa bị nhà tuyển dụng cập nhật.</p>
            <p>Tin đã được chuyển về trạng thái 'PendingApproval'. Vui lòng kiểm tra và duyệt lại nội dung.</p>
          `,
        });
        console.log('✅ Re-approval email sent to admin');
      } catch (emailError) {
        console.error('❌ Error sending re-approval email:', emailError);
      }
    }

    const updatedJob = await job.save();

    res.status(200).json({ message, job: updatedJob });

  } catch (error) {
    console.error("❌ Error updating job:", error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: "Lỗi máy chủ khi cập nhật công việc.", error: error.message });
  }
};

// ========================================
// UPLOAD PAYMENT PROOF - Upload biên lai
// ========================================
export const uploadPaymentProof = async (req, res) => {
  const { jobId } = req.params;
  const { paymentProof, packageType, paymentAmount } = req.body;
  const recruiterId = req.user.id;

  console.log(`💰 Recruiter ${recruiterId} uploading payment proof for job ${jobId}`);

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return res.status(400).json({ message: "ID công việc không hợp lệ." });
  }

  if (!paymentProof) {
    return res.status(400).json({ message: "Vui lòng upload ảnh biên lai chuyển khoản." });
  }

  // Validate packageType
  const validPackageTypes = ['1month', '3months'];
  const selectedPackageType = packageType || '1month';
  if (!validPackageTypes.includes(selectedPackageType)) {
    return res.status(400).json({ message: "Gói đăng tin không hợp lệ." });
  }

  // Tính toán paymentAmount và duration
  const packageInfo = {
    '1month': { amount: 150000, duration: 1 },
    '3months': { amount: 400000, duration: 3 }
  };
  const packageData = packageInfo[selectedPackageType];
  const finalPaymentAmount = paymentAmount || packageData.amount;

  try {
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy công việc." });
    }

    if (job.recruiter.toString() !== recruiterId) {
      return res.status(403).json({ message: "Bạn không có quyền cập nhật tin này." });
    }

    if (job.status !== 'PendingPayment') {
      return res.status(400).json({
        message: `Tin đang ở trạng thái '${job.status}', không thể upload biên lai.`,
      });
    }

    // ✅ FIX: Kiểm tra và thêm prefix nếu thiếu
    let base64Image = paymentProof;
    if (!paymentProof.startsWith('data:image')) {
      base64Image = `data:image/png;base64,${paymentProof}`;
    }

    // 🟢 Upload base64 image lên Cloudinary
    const uploadResponse = await cloudinary.v2.uploader.upload(base64Image, {
      folder: 'job_payment_proofs',
      resource_type: 'image'
    });

    // 🟢 Cập nhật Job với packageType và paymentAmount
    job.paymentProof = uploadResponse.secure_url;
    job.paymentDate = Date.now();
    job.paymentStatus = 'Pending';
    job.status = 'PendingApproval';
    job.packageType = selectedPackageType;
    job.duration = packageData.duration;
    job.paymentAmount = finalPaymentAmount;
    
    // Tính expiryDate dựa trên duration
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + packageData.duration);
    job.expiryDate = expiryDate;

    await job.save();
    console.log(`✅ Payment proof uploaded for job ${jobId}`);

    // 🟢 Gửi email thông báo cho Admin
    try {
      await transporter.sendMail({
        from: `"StudentWork - Admin Notification" <${process.env.EMAIL_USERNAME}>`,
        to: process.env.ADMIN_EMAIL || process.env.EMAIL_USERNAME,
        subject: '🔔 Có tin tuyển dụng mới cần duyệt',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
            <h2 style="color: #1f2937;">🔔 Có tin tuyển dụng mới cần xác nhận thanh toán</h2>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Công việc:</strong> ${job.title}</p>
              <p><strong>Công ty:</strong> ${job.company}</p>
              <p><strong>Nhà tuyển dụng ID:</strong> ${recruiterId}</p>
              <p><strong>Số tiền:</strong> ${job.paymentAmount.toLocaleString('vi-VN')} VND</p>
              <p><strong>Ngày upload:</strong> ${new Date().toLocaleString('vi-VN')}</p>
              <p><strong>Ảnh biên lai:</strong></p>
              <img src="${job.paymentProof}" alt="Payment Proof" style="max-width: 100%; border-radius: 8px;" />
            </div>
            <p>Vui lòng đăng nhập Admin Dashboard để xem biên lai và duyệt tin.</p>
          </div>
        `,
      });
      console.log('✅ Email notification sent to admin');
    } catch (emailError) {
      console.error('❌ Error sending admin email:', emailError);
    }

    res.status(200).json({
      message: "Upload biên lai thành công! Tin của bạn đang chờ Admin xác nhận.",
      job,
    });

  } catch (error) {
    console.error("❌ Error uploading payment proof:", error);
    res.status(500).json({ message: "Lỗi khi upload biên lai.", error: error.message });
  }
};

// ========================================
// GET PENDING JOBS - Admin lấy job chờ duyệt
// ========================================
export const getPendingJobs = async (req, res) => {
  console.log("👨‍💼 Admin request: Get jobs pending approval");

  try {
    const pendingJobs = await Job.find({ status: 'PendingApproval' })
      .populate('recruiter', 'name email phone companyName')
      .sort({ paymentDate: 1 });

    console.log(`✅ Found ${pendingJobs.length} jobs pending approval`);
    
    res.status(200).json(pendingJobs);

  } catch (error) {
    console.error("❌ Error getting pending jobs:", error);
    res.status(500).json({ message: "Lỗi khi lấy tin chờ duyệt.", error: error.message });
  }
};

// ========================================
// UPDATE JOB STATUS - Admin duyệt/từ chối
// ========================================
export const updateJobStatus = async (req, res) => {
  const { jobId } = req.params;
  const { status, rejectionReason } = req.body;
  const adminId = req.user.id;
  
  console.log(`👨‍💼 Admin ${adminId} updating job ${jobId} to status ${status}`);

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return res.status(400).json({ message: "ID công việc không hợp lệ." });
  }

  const validStatuses = ['Approved', 'Rejected'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ 
      message: "Trạng thái không hợp lệ. Chỉ chấp nhận 'Approved' hoặc 'Rejected'." 
    });
  }

  try {
    const job = await Job.findById(jobId).populate('recruiter', 'name email');
    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy công việc." });
    }

    if (job.status !== 'PendingApproval') {
      return res.status(400).json({ 
        message: `Chỉ có thể duyệt tin đang ở trạng thái 'PendingApproval'. Trạng thái hiện tại: ${job.status}` 
      });
    }

    if (!job.paymentProof && job.paymentStatus !== 'Verified') {
      return res.status(400).json({ 
        message: "Tin này chưa có biên lai thanh toán. Không thể duyệt." 
      });
    }

    job.status = status;
    job.reviewedBy = adminId;
    job.reviewedAt = Date.now();

    if (status === 'Approved') {
      job.paymentStatus = 'Verified';
      job.postedDate = Date.now();
    } else if (status === 'Rejected') {
      job.paymentStatus = 'Rejected';
      job.rejectionReason = rejectionReason || 'Không xác nhận được thanh toán hoặc nội dung không phù hợp';
    }

    await job.save();
    console.log(`✅ Job ${jobId} ${status} by admin ${adminId}`);

    try {
      const emailSubject = status === 'Approved' 
        ? `✅ Tin tuyển dụng đã được duyệt: ${job.title}`
        : `❌ Tin tuyển dụng bị từ chối: ${job.title}`;

      const emailContent = status === 'Approved' 
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
            <h2 style="color: #10b981;">🎉 Chúc mừng!</h2>
            <p>Tin tuyển dụng <strong>${job.title}</strong> của bạn đã được Admin xác nhận thanh toán và duyệt.</p>
            <p>Tin của bạn giờ đã hiển thị công khai trên hệ thống StudentWork.</p>
            <p style="margin-top: 20px;">Chúc bạn tìm được ứng viên phù hợp! 🚀</p>
          </div>
        `
        : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
            <h2 style="color: #dc2626;">Thông báo từ chối tin</h2>
            <p>Rất tiếc, tin tuyển dụng <strong>${job.title}</strong> của bạn không được duyệt.</p>
            <p><strong>Lý do:</strong> ${job.rejectionReason}</p>
            <p>Vui lòng đăng nhập, <strong>chỉnh sửa lại tin</strong> và <strong>upload lại biên lai</strong> để được duyệt lại.</p>
          </div>
        `;

      await transporter.sendMail({
        from: `"StudentWork Admin" <${process.env.EMAIL_USERNAME}>`,
        to: job.recruiter.email,
        subject: emailSubject,
        html: emailContent,
      });

      console.log(`✅ Status notification email sent to ${job.recruiter.email}`);
    } catch (emailError) {
      console.error('❌ Error sending email:', emailError);
    }

    res.status(200).json({
      message: status === 'Approved' 
        ? `Đã duyệt tin tuyển dụng thành công!` 
        : `Đã từ chối tin tuyển dụng.`,
      job
    });

  } catch (error) {
    console.error("❌ Error updating job status:", error);
    res.status(500).json({ message: "Lỗi khi cập nhật trạng thái.", error: error.message });
  }
};

// ========================================
// GET ALL APPROVED JOBS - Public
// ========================================
export const getAllApprovedJobs = async (req, res) => {
  console.log("Public request: Get all approved jobs");

  const { type, location, search } = req.query;
  const queryFilter = { status: 'Approved' };

  if (type && type !== 'all') queryFilter.type = type;
  
  // Xử lý location search linh hoạt
  const locationMapping = {
    'Q1': ['Q1', 'Quận 1', 'quận 1', 'quan 1'],
    'Q2': ['Q2', 'Quận 2', 'quận 2', 'quan 2'],
    'Q3': ['Q3', 'Quận 3', 'quận 3', 'quan 3'],
    'Q4': ['Q4', 'Quận 4', 'quận 4', 'quan 4'],
    'Q5': ['Q5', 'Quận 5', 'quận 5', 'quan 5'],
    'Q6': ['Q6', 'Quận 6', 'quận 6', 'quan 6'],
    'Q7': ['Q7', 'Quận 7', 'quận 7', 'quan 7'],
    'Q8': ['Q8', 'Quận 8', 'quận 8', 'quan 8'],
    'Q9': ['Q9', 'Quận 9', 'quận 9', 'quan 9'],
    'Q10': ['Q10', 'Quận 10', 'quận 10', 'quan 10'],
    'Q11': ['Q11', 'Quận 11', 'quận 11', 'quan 11'],
    'Q12': ['Q12', 'Quận 12', 'quận 12', 'quan 12'],
    'HCM': ['HCM', 'Hồ Chí Minh', 'TP.HCM', 'TP HCM', 'Sài Gòn', 'Sai Gon', 'Ho Chi Minh'],
    'Remote': ['Remote', 'Từ xa', 'Làm việc từ xa', 'Work from home', 'WFH'],
    'HaNoi': ['HaNoi', 'Hà Nội', 'Ha Noi', 'Hanoi'],
    'DaNang': ['DaNang', 'Đà Nẵng', 'Da Nang', 'Danang'],
  };

  let locationFilter = null;
  if (location && location !== 'all' && location !== '') {
    // Nếu location có trong mapping, tìm tất cả các biến thể
    if (locationMapping[location]) {
      const locationVariants = locationMapping[location];
      locationFilter = {
        $or: locationVariants.map(v => ({ location: { $regex: v, $options: 'i' } }))
      };
    } else {
      // Nếu không có trong mapping, tìm kiếm bình thường
      locationFilter = { location: { $regex: location, $options: 'i' } };
    }
  }

  // Xử lý search
  let searchFilter = null;
  if (search) {
    searchFilter = {
      $or: [
        { title: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    };
  }

  // Kết hợp các filter
  if (locationFilter && searchFilter) {
    queryFilter.$and = [locationFilter, searchFilter];
  } else if (locationFilter) {
    Object.assign(queryFilter, locationFilter);
  } else if (searchFilter) {
    Object.assign(queryFilter, searchFilter);
  }

  try {
    const approvedJobs = await Job.find(queryFilter)
      .populate('recruiter', 'name companyName avatar')
      .sort({ postedDate: -1 });

    console.log(`✅ Found ${approvedJobs.length} approved jobs`);
    
    res.status(200).json(approvedJobs);

  } catch (error) {
    console.error("❌ Error getting approved jobs:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách công việc.", error: error.message });
  }
};

// ========================================
// 🚀 FIX (N+1): GET JOBS BY RECRUITER
// ========================================
export const getJobsByRecruiter = async (req, res) => {
  const recruiterId = req.user?.id;
  console.log(`Recruiter request: Get jobs for recruiter: ${recruiterId}`);

  if (!recruiterId) {
    return res.status(401).json({ message: "Không xác thực được nhà tuyển dụng." });
  }

  try {
    const jobs = await Job.find({ recruiter: recruiterId })
      .sort({ createdAt: -1 })
      .lean();

    if (jobs.length === 0) {
      return res.status(200).json([]);
    }

    const jobIds = jobs.map(job => job._id);

    const appCounts = await Application.aggregate([
      { $match: { job: { $in: jobIds } } },
      { 
        $group: { 
          _id: '$job',
          count: { $sum: 1 }
        } 
      }
    ]);

    const countMap = appCounts.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr.count;
      return acc;
    }, {});

    const jobsWithCount = jobs.map(job => ({
      ...job,
      applicantsCount: countMap[job._id.toString()] || 0,
    }));

    console.log(`✅ Found ${jobsWithCount.length} jobs for recruiter ${recruiterId}`);
    res.status(200).json(jobsWithCount);
    
  } catch (error) {
    console.error("❌ Error getting jobs by recruiter:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách công việc.", error: error.message });
  }
};

// ========================================
// DELETE JOB
// ========================================
export const deleteJob = async (req, res) => {
  const { jobId } = req.params;
  const { id: userId, role: userRole } = req.user;

  console.log(`Delete request for job: ${jobId} by user: ${userId} (Role: ${userRole})`);

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return res.status(400).json({ message: "ID công việc không hợp lệ." });
  }

  try {
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy công việc này." });
    }

    if (userRole !== 'admin' && !job.recruiter.equals(userId)) {
      return res.status(403).json({ message: "Bạn không có quyền xóa công việc này." });
    }

    await Job.findByIdAndDelete(jobId);
    console.log("✅ Job deleted successfully:", jobId);

    const deleteResult = await Application.deleteMany({ job: jobId });
    console.log(`✅ Deleted ${deleteResult.deletedCount} related applications`);
    
    res.status(200).json({ message: "Xóa tin tuyển dụng và các đơn ứng tuyển liên quan thành công." });

  } catch (error) {
    console.error("❌ Error deleting job:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi xóa công việc.", error: error.message });
  }
};

// ========================================
// GET JOB BY ID
// ========================================
export const getJobById = async (req, res) => {
  const { jobId } = req.params;
  const token = req.headers.authorization?.split(" ")[1];

  let userRole = 'guest';
  let userId = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userRole = decoded.role;
      userId = decoded.id;
    } catch {
      console.log("⚠️ Token không hợp lệ hoặc hết hạn");
    }
  }

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return res.status(400).json({ message: "ID công việc không hợp lệ." });
  }

  try {
    const job = await Job.findById(jobId)
      .populate('recruiter', 'name email phone companyName companyDescription companyWebsite');

    if (!job) {
      return res.status(404).json({ message: "Không tìm thấy công việc này." });
    }

    const recruiterId = job.recruiter?._id?.toString() || job.recruiter?.toString();

    if (userRole === 'admin' || (userRole === 'recruiter' && recruiterId === userId)) {
      return res.status(200).json(job);
    }

    if (job.status !== 'Approved') {
      return res.status(404).json({ message: "Không tìm thấy công việc này hoặc tin chưa được duyệt." });
    }

    return res.status(200).json(job);
  } catch (error) {
    console.error("❌ Error getting job by ID:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi tải chi tiết công việc." });
  }
};

// ========================================
// GET TRANSACTION HISTORY & REVENUE - Admin lấy lịch sử giao dịch và tổng doanh thu
// ========================================
export const getTransactionHistory = async (req, res) => {
  console.log("👨‍💼 Admin request: Get transaction history and revenue");

  try {
    // Lấy tất cả các job đã được duyệt và có paymentStatus là Verified
    const transactions = await Job.find({
      status: 'Approved',
      paymentStatus: 'Verified',
      paymentAmount: { $exists: true, $gt: 0 }
    })
      .populate('recruiter', 'name email companyName')
      .sort({ paymentDate: -1 })
      .select('title company paymentAmount paymentDate packageType duration recruiter createdAt');

    // Tính tổng doanh thu
    const totalRevenue = transactions.reduce((sum, job) => {
      return sum + (job.paymentAmount || 0);
    }, 0);

    // Thống kê theo gói
    const revenueByPackage = {
      '1month': {
        count: transactions.filter(j => j.packageType === '1month').length,
        revenue: transactions
          .filter(j => j.packageType === '1month')
          .reduce((sum, j) => sum + (j.paymentAmount || 0), 0)
      },
      '3months': {
        count: transactions.filter(j => j.packageType === '3months').length,
        revenue: transactions
          .filter(j => j.packageType === '3months')
          .reduce((sum, j) => sum + (j.paymentAmount || 0), 0)
      }
    };

    console.log(`✅ Found ${transactions.length} transactions, Total revenue: ${totalRevenue.toLocaleString('vi-VN')} VND`);

    res.status(200).json({
      transactions,
      totalRevenue,
      totalTransactions: transactions.length,
      revenueByPackage
    });

  } catch (error) {
    console.error("❌ Error getting transaction history:", error);
    res.status(500).json({ message: "Lỗi khi lấy lịch sử giao dịch.", error: error.message });
  }
};