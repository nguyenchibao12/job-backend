// server/controllers/applicationController.js
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import nodemailer from 'nodemailer';

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

// ========================================
// STUDENT: Nộp đơn ứng tuyển
// ========================================
export const createApplication = async (req, res) => {
  const { jobId, coverLetter } = req.body;
  const studentId = req.user.id;

  console.log(`📝 Student ${studentId} applying for job ${jobId}`);

  try {
    // 1. Kiểm tra job tồn tại
    // ✅ SỬA: postedBy → recruiter
    const job = await Job.findById(jobId).populate('recruiter', 'name email');
    if (!job) {
      return res.status(404).json({ message: 'Công việc không tồn tại.' });
    }

    // 2. Kiểm tra đã ứng tuyển chưa
    const existingApplication = await Application.findOne({ 
      job: jobId, 
      student: studentId 
    });
    
    if (existingApplication) {
      return res.status(400).json({ message: 'Bạn đã ứng tuyển vào công việc này rồi.' });
    }

    // 3. Tạo đơn ứng tuyển
    // ✅ SỬA: job.postedBy → job.recruiter
    const newApplication = new Application({
      job: jobId,
      student: studentId,
      recruiter: job.recruiter._id, // ✅ Đổi từ job.postedBy thành job.recruiter
      coverLetter: coverLetter || '',
      status: 'Submitted',
    });

    await newApplication.save();
    console.log(`✅ Application created: ${newApplication._id}`);

    res.status(201).json({
      message: 'Nộp đơn ứng tuyển thành công!',
      application: newApplication,
    });

  } catch (error) {
    console.error('❌ Error creating application:', error);
    
    // Handle duplicate error
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Bạn đã ứng tuyển vào công việc này rồi.' });
    }
    
    res.status(500).json({ 
      message: 'Lỗi khi nộp đơn ứng tuyển.', 
      error: error.message 
    });
  }
};

// ========================================
// RECRUITER: Lấy danh sách ứng viên cho 1 job
// ========================================
export const getApplicationsForJob = async (req, res) => {
  const { jobId } = req.params;
  const recruiterId = req.user.id;

  console.log(`📋 Recruiter ${recruiterId} fetching applications for job ${jobId}`);

  try {
    // 1. Kiểm tra job có tồn tại không
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: 'Công việc không tồn tại.' });
    }

    console.log(`✅ Job found:`, {
      _id: job._id,
      title: job.title,
      recruiter: job.recruiter, // ✅ ĐỔI: postedBy → recruiter
      recruiterId: recruiterId
    });

    // 2. Kiểm tra quyền sở hữu job
    const jobOwnerId = job.recruiter.toString(); // ✅ ĐỔI: postedBy → recruiter
    const currentRecruiterId = recruiterId.toString();

    if (jobOwnerId !== currentRecruiterId) {
      console.log(`❌ Permission denied: Job owner (${jobOwnerId}) !== Current recruiter (${currentRecruiterId})`);
      return res.status(403).json({ 
        message: 'Bạn không có quyền xem ứng viên của công việc này.'
      });
    }

    // 3. Lấy danh sách applications và populate đầy đủ
    const applications = await Application.find({ job: jobId })
      .populate({
        path: 'student',
        select: 'name email phone location avatar about education experience skills languages'
      })
      .populate({
        path: 'job',
        select: 'title company location salary'
      })
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${applications.length} applications`);
    
    // Debug log
    if (applications.length > 0) {
      console.log('📦 Sample application student:', {
        name: applications[0].student?.name,
        email: applications[0].student?.email,
        skills: applications[0].student?.skills
      });
    }

    res.status(200).json(applications);

  } catch (error) {
    console.error('❌ Error fetching applications:', error);
    res.status(500).json({ 
      message: 'Lỗi khi lấy danh sách ứng viên.', 
      error: error.message 
    });
  }
};

// ========================================
// RECRUITER: Cập nhật trạng thái đơn
// ========================================
export const updateApplicationStatus = async (req, res) => {
  const { applicationId } = req.params;
  const { status } = req.body;
  const recruiterId = req.user.id;

  console.log(`🔄 Recruiter ${recruiterId} updating application ${applicationId} to ${status}`);

  // Validate status
  const validStatuses = ['Submitted', 'Viewed', 'Shortlisted', 'Rejected', 'Interviewing', 'Hired'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ.' });
  }

  try {
    // 1. Tìm application và kiểm tra quyền
    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ message: 'Không tìm thấy đơn ứng tuyển.' });
    }

    if (application.recruiter.toString() !== recruiterId) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật đơn này.' });
    }

    // 2. Cập nhật status
    application.status = status;
    await application.save();

    console.log(`✅ Application ${applicationId} status updated to ${status}`);

    // ✅ 3. GỬI EMAIL KHI TUYỂN DỤNG (HIRED) - Async, không block response
    if (status === 'Hired') {
      // Populate đầy đủ thông tin để gửi email
      application.populate([
        { path: 'student', select: 'name email' },
        { path: 'job', select: 'title company location salary' },
        { path: 'recruiter', select: 'name email phone companyName' }
      ]).then((populatedApp) => {
        console.log(`📧 Sending hired email to ${populatedApp.student.email}...`);

        const mailOptions = {
          from: `"StudentWork - Thông Báo Tuyển Dụng" <${process.env.EMAIL_USERNAME}>`,
          to: populatedApp.student.email,
          subject: `🎉 Chúc mừng! Bạn đã được tuyển dụng tại ${populatedApp.job.company}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 10px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Chúc Mừng!</h1>
              </div>
              
              <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
                <p style="font-size: 18px; color: #1f2937; margin-bottom: 10px;">
                  Xin chào <strong>${populatedApp.student.name}</strong>,
                </p>
                
                <p style="color: #4b5563; line-height: 1.6;">
                  Chúng tôi rất vui mừng thông báo rằng bạn đã được chọn cho vị trí:
                </p>

                <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 5px;">
                  <h2 style="color: #059669; margin: 0 0 10px 0; font-size: 20px;">
                    ${populatedApp.job.title}
                  </h2>
                  <p style="color: #047857; margin: 5px 0;">
                    <strong>🏢 Công ty:</strong> ${populatedApp.job.company}
                  </p>
                  <p style="color: #047857; margin: 5px 0;">
                    <strong>📍 Địa điểm:</strong> ${populatedApp.job.location || 'Liên hệ để biết thêm'}
                  </p>
                  ${populatedApp.job.salary ? `
                    <p style="color: #047857; margin: 5px 0;">
                      <strong>💰 Lương:</strong> ${populatedApp.job.salary}
                    </p>
                  ` : ''}
                </div>

                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #1f2937; margin-top: 0; font-size: 16px;">📞 Thông tin liên hệ nhà tuyển dụng:</h3>
                  <p style="color: #4b5563; margin: 5px 0;">
                    <strong>Tên:</strong> ${populatedApp.recruiter.companyName || populatedApp.recruiter.name}
                  </p>
                  <p style="color: #4b5563; margin: 5px 0;">
                    <strong>Email:</strong> <a href="mailto:${populatedApp.recruiter.email}" style="color: #4f46e5; text-decoration: none;">${populatedApp.recruiter.email}</a>
                  </p>
                  ${populatedApp.recruiter.phone ? `
                    <p style="color: #4b5563; margin: 5px 0;">
                      <strong>Số điện thoại:</strong> ${populatedApp.recruiter.phone}
                    </p>
                  ` : ''}
                </div>

                <p style="color: #4b5563; line-height: 1.6;">
                  Nhà tuyển dụng sẽ liên hệ với bạn trong thời gian sớm nhất để thông báo chi tiết về:
                </p>
                <ul style="color: #4b5563; line-height: 1.8;">
                  <li>Ngày bắt đầu làm việc</li>
                  <li>Thủ tục nhập việc</li>
                  <li>Các thông tin cần thiết khác</li>
                </ul>

                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                  <p style="color: #10b981; font-weight: bold; font-size: 16px; margin-bottom: 10px;">
                    Chúc bạn thành công trong công việc mới! 🚀
                  </p>
                </div>

                <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                  Đây là email tự động từ hệ thống <strong>StudentWork</strong>.<br>
                  Vui lòng không trả lời email này.
                </p>
              </div>
            </div>
          `,
        };

        // Gửi email async, không block response
        return transporter.sendMail(mailOptions);
      }).then(() => {
        console.log(`✅ Hired notification email sent successfully`);
      }).catch((emailError) => {
        console.error('❌ Error sending hired email:', emailError);
        // Không throw error để không ảnh hưởng đến việc update status
      });
    }

    // ✅ 4. GỬI EMAIL KHI TỪ CHỐI (REJECTED) - Async, không block response
    if (status === 'Rejected') {
      application.populate([
        { path: 'student', select: 'name email' },
        { path: 'job', select: 'title company' },
        { path: 'recruiter', select: 'companyName name' }
      ]).then((populatedApp) => {
        console.log(`📧 Sending rejection email to ${populatedApp.student.email}...`);

        const mailOptions = {
          from: `"StudentWork - Thông Báo" <${process.env.EMAIL_USERNAME}>`,
          to: populatedApp.student.email,
          subject: `Thông báo về đơn ứng tuyển tại ${populatedApp.job.company}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1f2937;">Xin chào ${populatedApp.student.name},</h2>
              <p style="color: #4b5563; line-height: 1.6;">
                Cảm ơn bạn đã quan tâm và ứng tuyển vào vị trí <strong>${populatedApp.job.title}</strong> tại <strong>${populatedApp.job.company}</strong>.
              </p>
              <p style="color: #4b5563; line-height: 1.6;">
                Sau khi xem xét kỹ lưỡng, chúng tôi rất tiếc phải thông báo rằng lần này chúng tôi đã chọn ứng viên phù hợp hơn với vị trí này.
              </p>
              <p style="color: #4b5563; line-height: 1.6;">
                Tuy nhiên, chúng tôi rất ấn tượng với hồ sơ của bạn và hy vọng sẽ có cơ hội hợp tác trong tương lai.
              </p>
              <p style="color: #4b5563; line-height: 1.6;">
                Chúc bạn sớm tìm được công việc phù hợp! 💪
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                Đây là email tự động từ hệ thống StudentWork. Vui lòng không trả lời email này.
              </p>
            </div>
          `,
        };

        // Gửi email async, không block response
        return transporter.sendMail(mailOptions);
      }).then(() => {
        console.log(`✅ Rejection email sent successfully`);
      }).catch((emailError) => {
        console.error('❌ Error sending rejection email:', emailError);
      });
    }

    // 5. Trả về response
    res.status(200).json({
      message: status === 'Hired' 
        ? '🎉 Đã tuyển dụng ứng viên! Email thông báo đã được gửi.' 
        : status === 'Rejected'
        ? 'Đã từ chối ứng viên. Email thông báo đã được gửi.'
        : 'Cập nhật trạng thái thành công!',
      application,
    });

  } catch (error) {
    console.error('❌ Error updating application status:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái.', error: error.message });
  }
};

// ========================================
// STUDENT: Xem các đơn đã nộp của mình
// ========================================
export const getMyApplications = async (req, res) => {
  const studentId = req.user.id;

  console.log(`📋 Student ${studentId} fetching their applications`);

  try {
    const applications = await Application.find({ student: studentId })
      .populate({
        path: 'job',
        select: 'title company location salary recruiter', // ✅ Đổi postedBy → recruiter
        populate: {
          path: 'recruiter', // ✅ Đổi postedBy → recruiter
          select: 'name email companyName'
        }
      })
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${applications.length} applications for student`);

    res.status(200).json(applications);

  } catch (error) {
    console.error('❌ Error fetching my applications:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách đơn ứng tuyển.', error: error.message });
  }
};