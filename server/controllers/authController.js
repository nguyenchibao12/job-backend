import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import cloudinary from 'cloudinary'; // ✅ THÊM IMPORT
import mongoose from 'mongoose';

// ✅ CONFIG CLOUDINARY
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
export const register = async (req, res) => {
  // Lấy dữ liệu từ request body
  const { name, email, phone, password, role } = req.body;

  console.log("Register request body:", req.body);

  // Validation cơ bản
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "Vui lòng điền đầy đủ thông tin bắt buộc (Tên, Email, Mật khẩu, Vai trò)." });
  }
  // Thêm validation khác nếu cần (độ dài pass, định dạng email...)

  try {
    // 1. Kiểm tra email tồn tại
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("Email already exists:", email);
      return res.status(400).json({ message: "Email đã tồn tại. Vui lòng sử dụng email khác." });
    }

    // 2. Hash mật khẩu
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log("Password hashed successfully.");

    // 3. Tạo user mới (bao gồm phone)
    const newUser = new User({
      name,
      email,
      phone, // Thêm phone
      password: hashedPassword,
      role
    });
    console.log("Creating new user object:", newUser);

    // 4. Lưu user vào DB
    const savedUser = await newUser.save();
    console.log("User saved successfully:", savedUser);

    // 5. Trả về response thành công (không trả password)
    const userResponse = {
      _id: savedUser._id,
      name: savedUser.name,
      email: savedUser.email,
      phone: savedUser.phone, // Trả về phone
      role: savedUser.role
    };

    res.status(201).json({ message: "Đăng ký thành công!", user: userResponse });

  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi phía máy chủ khi đăng ký.", error: error.message });
  }
};

// --- HÀM ĐĂNG NHẬP (login) ---
export const login = async (req, res) => {
  // 1. Lấy email và password từ request body
  const { email, password } = req.body;

  console.log("Login request body:", req.body);

  // --- Validation cơ bản ---
  if (!email || !password) {
    return res.status(400).json({ message: "Vui lòng nhập cả email và mật khẩu." });
  }

  try {
    // 2. Tìm user trong database bằng email
    // Dùng .select('+password') để lấy cả trường password (nếu schema có select: false)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log("Login failed: User not found with email:", email);
      return res.status(400).json({ message: "Sai email hoặc mật khẩu." }); // Thông báo chung chung
    }
    console.log("User found:", user.email);

    // 3. So sánh mật khẩu đã hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("Login failed: Password incorrect for email:", email);
      return res.status(400).json({ message: "Sai email hoặc mật khẩu." }); // Thông báo chung chung
    }
    console.log("Password matched for:", user.email);

    // 4. Tạo JSON Web Token (JWT)
    // Payload chứa thông tin muốn mã hóa vào token (không nên chứa thông tin nhạy cảm)
    const payload = {
      id: user._id, // ID của user trong DB
      role: user.role // Vai trò của user
      // Có thể thêm name hoặc email nếu muốn, nhưng ID và role là đủ
    };

    // Lấy secret key từ biến môi trường (.env)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("JWT_SECRET is not defined in .env file!");
      return res.status(500).json({ message: "Lỗi cấu hình server (JWT Secret missing)." });
    }

    // Ký token với thời hạn (ví dụ: 1 ngày)
    const token = jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: "1d" } // Token hết hạn sau 1 ngày
    );
    console.log("JWT generated successfully for:", user.email);

    // 5. Trả về token và thông tin user (không bao gồm password)
    // Tạo object user response riêng để đảm bảo không lộ password
    const userResponse = {
      _id: user._id, // Hoặc id
      name: user.name,
      email: user.email,
      phone: user.phone, // Trả về cả phone
      role: user.role,
      // Có thể thêm các trường khác lấy từ user object nếu cần (avatar, location...)
      // Lấy từ user object đã tìm được ở trên
      avatar: user.avatar,
      location: user.location,
      about: user.about,
      education: user.education,
      experience: user.experience,
      skills: user.skills,
      languages: user.languages,
      companyName: user.companyName,
      companyDescription: user.companyDescription,
      companyWebsite: user.companyWebsite,
      companyImages: user.companyImages || [],  // ✅ THÊM DÒNG NÀY

    };


    res.status(200).json({ // Status 200 OK
      message: "Đăng nhập thành công!",
      token: token,
      user: userResponse // Gửi kèm thông tin user để frontend lưu vào context
    });

  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi phía máy chủ khi đăng nhập.", error: error.message });
  }
};
// ========================================
// --- HÀM QUÊN MẬT KHẨU (forgotPassword) - FIXED ---
// ========================================
export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  console.log("📧 Forgot password request for email:", email);

  if (!email) {
    return res.status(400).json({ message: "Vui lòng nhập địa chỉ email." });
  }

  try {
    // 1. Tìm user bằng email
    const user = await User.findOne({ email });
    if (!user) {
      console.log("⚠️ User not found with email:", email);
      // Vẫn trả về success để không lộ thông tin
      return res.status(200).json({ 
        message: "Nếu email tồn tại trong hệ thống, một liên kết đặt lại mật khẩu đã được gửi." 
      });
    }
    console.log("✅ User found:", user.email);

    // 2. Tạo Reset Token
    const resetToken = crypto.randomBytes(32).toString('hex');
    console.log("🔑 Generated reset token (raw):", resetToken);

    // 3. Hash token và set expire time (1 giờ thay vì 10 phút)
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 giờ
    console.log("🔒 Hashed token:", user.resetPasswordToken);
    console.log("⏰ Token expires at:", new Date(user.resetPasswordExpire).toLocaleString());

    await user.save({ validateBeforeSave: false });
    console.log("💾 Reset token saved to database");

    // ✅ 4. SỬ DỤNG BIẾN MÔI TRƯỜNG CHO FRONTEND URL
    const frontendUrl = process.env.FRONTEND_URL || 'https://exe2.vercel.app';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
    console.log("🔗 Reset URL:", resetUrl);

    // ✅ 5. EMAIL TEMPLATE ĐẸP HƠN
    const emailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 28px; }
          .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #4f46e5; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
          .url-box { background: #f3f4f6; padding: 12px; border-radius: 5px; word-break: break-all; font-size: 13px; color: #4f46e5; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Đặt Lại Mật Khẩu</h1>
          </div>
          
          <div class="content">
            <p style="font-size: 16px; margin-bottom: 10px;">Xin chào <strong>${user.name || 'bạn'}</strong>,</p>
            
            <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản StudentWork của bạn.</p>
            
            <p>Nhấp vào nút bên dưới để đặt lại mật khẩu:</p>

            <div style="text-align: center;">
              <a href="${resetUrl}" class="button" style="color: white;">Đặt Lại Mật Khẩu</a>
            </div>

            <p style="color: #6b7280; font-size: 14px;">Hoặc copy link sau vào trình duyệt:</p>
            <div class="url-box">${resetUrl}</div>

            <div class="warning">
              <p style="color: #92400e; margin: 0; font-size: 14px;">
                ⚠️ <strong>Lưu ý quan trọng:</strong>
              </p>
              <ul style="color: #92400e; margin: 10px 0 0 0; padding-left: 20px;">
                <li>Link này chỉ có hiệu lực trong <strong>1 giờ</strong></li>
                <li>Link chỉ sử dụng được <strong>một lần</strong></li>
                <li>Không chia sẻ link này với bất kỳ ai</li>
              </ul>
            </div>

            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Nếu bạn <strong>không yêu cầu</strong> đặt lại mật khẩu, vui lòng bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.
            </p>

            <div class="footer">
              <p><strong>StudentWork</strong> - Nền tảng tìm việc Part-time cho Sinh viên</p>
              <p>Email tự động, vui lòng không trả lời.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // ✅ 6. CẤU HÌNH EMAIL VỚI ERROR HANDLING TỐT HƠN
    try {
      // Validate email config
      if (!process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD) {
        throw new Error('❌ Missing EMAIL_USERNAME or EMAIL_PASSWORD in environment variables');
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verify transporter config trước khi gửi
      await transporter.verify();
      console.log('✅ Email transporter verified');

      const mailOptions = {
        from: `"StudentWork - Hỗ Trợ" <${process.env.EMAIL_USERNAME}>`,
        to: user.email,
        subject: "🔐 Đặt Lại Mật Khẩu - StudentWork",
        html: emailTemplate,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("✅ Reset email sent successfully to:", user.email);
      console.log("📨 Message ID:", info.messageId);

      res.status(200).json({ 
        message: "Email đặt lại mật khẩu đã được gửi! Vui lòng kiểm tra hộp thư của bạn." 
      });

    } catch (emailError) {
      console.error("❌ Error sending reset email:", emailError);
      console.error("Error details:", {
        code: emailError.code,
        command: emailError.command,
        response: emailError.response,
        message: emailError.message
      });

      // Xóa token nếu gửi email thất bại
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      console.log("🗑️ Reset token cleared due to email error");

      return res.status(500).json({ 
        message: "Không thể gửi email. Vui lòng kiểm tra lại địa chỉ email hoặc thử lại sau.",
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }

  } catch (error) {
    console.error("❌ Error in forgotPassword:", error);
    res.status(500).json({ 
      message: "Đã xảy ra lỗi phía máy chủ.", 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ========================================
// --- HÀM ĐẶT LẠI MẬT KHẨU (resetPassword) ---
// ========================================
export const resetPassword = async (req, res) => {
  // 1. Lấy token từ URL params (ví dụ: /api/auth/reset-password/:token)
  const resetToken = req.params.token;
  // Lấy mật khẩu mới từ body
  const { password } = req.body;

  console.log("🔄 Reset password request received");
  console.log("Token (raw):", resetToken);
  console.log("New password provided:", password ? 'Yes' : 'No');

  // Validation
  if (!resetToken || !password) {
    return res.status(400).json({ message: "Thiếu thông tin token hoặc mật khẩu mới." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Mật khẩu mới phải có ít nhất 6 ký tự." });
  }

  try {
    // 2. Hash token nhận được để so sánh với DB
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    console.log("🔒 Hashed token from URL:", hashedToken);

    // 3. Tìm user bằng hashed token và kiểm tra thời hạn
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() } // Token chưa hết hạn
    });

    if (!user) {
      console.log("❌ Reset password failed: Invalid or expired token");
      return res.status(400).json({ 
        message: "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu link mới." 
      });
    }
    console.log("✅ Valid token found for user:", user.email);

    // 4. Hash mật khẩu mới
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    console.log("🔐 New password hashed successfully");

    // 5. Xóa thông tin reset token khỏi user
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    // 6. Lưu lại user với mật khẩu mới
    await user.save();
    console.log("✅ New password saved and reset token cleared for:", user.email);

    // 7. Trả về thành công
    res.status(200).json({ 
      message: "Đặt lại mật khẩu thành công! Bạn có thể đăng nhập với mật khẩu mới." 
    });

  } catch (error) {
    console.error("❌ Error in resetPassword:", error);
    res.status(500).json({ 
      message: "Đã xảy ra lỗi phía máy chủ khi đặt lại mật khẩu.", 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// Có thể thêm các hàm khác như forgot password, reset password...
export const updateStudentProfile = async (req, res) => {
  const userId = req.user?.id;
  const userRole = req.user?.role;

  const {
    name, phone, location, about,
    education, experience, skills, languages, avatar
  } = req.body;

  console.log(`Update profile request for user: ${userId}, role: ${userRole}`);

  if (!userId) {
    return res.status(401).json({ message: "Không xác thực được người dùng." });
  }

  if (userRole !== 'student') {
    return res.status(403).json({ message: "Chỉ student mới được dùng endpoint này." });
  }

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy user." });
    }

    // ✅ XỬ LÝ AVATAR NẾU CÓ
    if (avatar && avatar.startsWith('data:image')) {
      try {
        console.log('📸 Uploading student avatar to Cloudinary...');

        const uploadResponse = await cloudinary.v2.uploader.upload(avatar, {
          folder: 'user_avatars',
          resource_type: 'image',
          transformation: [
            { width: 300, height: 300, crop: 'fill', gravity: 'face' },
            { quality: 'auto:good' }
          ]
        });

        user.avatar = uploadResponse.secure_url;
        console.log('✅ Avatar uploaded:', uploadResponse.secure_url);
      } catch (uploadError) {
        console.error('❌ Error uploading avatar:', uploadError);
        return res.status(400).json({ message: 'Lỗi khi upload avatar: ' + uploadError.message });
      }
    }

    // Cập nhật các field khác
    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (location !== undefined) user.location = location;
    if (about !== undefined) user.about = about;
    if (education) user.education = education;
    if (experience) user.experience = experience;
    if (skills) user.skills = skills;
    if (languages) user.languages = languages;

    await user.save();

    console.log("✅ Student profile updated successfully:", user.email);

    // Tạo response object đầy đủ
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      location: user.location,
      avatar: user.avatar,
      about: user.about,
      role: user.role,
      education: user.education || [],
      experience: user.experience || [],
      skills: user.skills || [],
      languages: user.languages || [],
    };

    res.status(200).json({
      message: "Cập nhật hồ sơ thành công!",
      user: userResponse
    });

  } catch (error) {
    console.error("❌ Error updating student profile:", error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: "Lỗi máy chủ khi cập nhật hồ sơ.", error: error.message });
  }
};

export const updateRecruiterProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || user.role !== 'recruiter') {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật hồ sơ này.' });
    }

    const { 
      companyName, companyDescription, companyWebsite, location, phone, avatar,
      companyAddress, companySize, companyFoundedYear, companyIndustry,
      companyFacebook, companyLinkedIn, companyWorkingHours, companyCulture
    } = req.body;

    // ✅ XỬ LÝ AVATAR/LOGO NẾU CÓ
    if (avatar && avatar.startsWith('data:image')) {
      try {
        console.log('🏢 Uploading company logo to Cloudinary...');

        const uploadResponse = await cloudinary.v2.uploader.upload(avatar, {
          folder: 'company_logos',
          resource_type: 'image',
          transformation: [
            { width: 300, height: 300, crop: 'fill' },
            { quality: 'auto:good' }
          ]
        });

        user.avatar = uploadResponse.secure_url;
        console.log('✅ Company logo uploaded:', uploadResponse.secure_url);
      } catch (uploadError) {
        console.error('❌ Error uploading logo:', uploadError);
        return res.status(400).json({ message: 'Lỗi khi upload logo: ' + uploadError.message });
      }
    }

    // Cập nhật các field khác
    if (companyName !== undefined) user.companyName = companyName;
    if (companyDescription !== undefined) user.companyDescription = companyDescription;
    if (companyWebsite !== undefined) user.companyWebsite = companyWebsite;
    if (companyAddress !== undefined) user.companyAddress = companyAddress;
    if (companySize !== undefined) user.companySize = companySize;
    if (companyFoundedYear !== undefined) user.companyFoundedYear = companyFoundedYear;
    if (companyIndustry !== undefined) user.companyIndustry = companyIndustry;
    if (companyFacebook !== undefined) user.companyFacebook = companyFacebook;
    if (companyLinkedIn !== undefined) user.companyLinkedIn = companyLinkedIn;
    if (companyWorkingHours !== undefined) user.companyWorkingHours = companyWorkingHours;
    if (companyCulture !== undefined) user.companyCulture = companyCulture;
    if (location !== undefined) user.location = location;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    console.log('✅ Recruiter profile updated successfully:', user.email);

    // Tạo response object đầy đủ
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      location: user.location,
      avatar: user.avatar,
      role: user.role,
      companyName: user.companyName,
      companyDescription: user.companyDescription,
      companyWebsite: user.companyWebsite,
      companyAddress: user.companyAddress,
      companySize: user.companySize,
      companyFoundedYear: user.companyFoundedYear,
      companyIndustry: user.companyIndustry,
      companyFacebook: user.companyFacebook,
      companyLinkedIn: user.companyLinkedIn,
      companyWorkingHours: user.companyWorkingHours,
      companyCulture: user.companyCulture,
      companyImages: user.companyImages || [],
    };

    res.json({ message: 'Cập nhật hồ sơ nhà tuyển dụng thành công.', user: userResponse });
  } catch (error) {
    console.error('❌ Lỗi updateRecruiterProfile:', error);
    res.status(500).json({ message: 'Lỗi server khi cập nhật hồ sơ nhà tuyển dụng.' });
  }
};

// ========================================
// ✅ UPLOAD COMPANY IMAGES
// ========================================
export const uploadCompanyImages = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || user.role !== 'recruiter') {
      return res.status(403).json({ message: 'Bạn không có quyền upload ảnh công ty.' });
    }

    const { images } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất 1 ảnh.' });
    }

    if (images.length > 6) {
      return res.status(400).json({ message: 'Tối đa 6 ảnh.' });
    }

    console.log(`📸 Uploading ${images.length} company images...`);

    const uploadPromises = images.map(async (img) => {
      let base64Image = img;
      if (!img.startsWith('data:image')) {
        base64Image = `data:image/png;base64,${img}`;
      }

      const uploadResponse = await cloudinary.v2.uploader.upload(base64Image, {
        folder: 'company_images',
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 800, crop: 'limit' },
          { quality: 'auto:good' }
        ]
      });

      return uploadResponse.secure_url;
    });

    const uploadedUrls = await Promise.all(uploadPromises);

    user.companyImages = uploadedUrls;
    await user.save();

    console.log(`✅ Uploaded ${uploadedUrls.length} company images`);

    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      location: user.location,
      avatar: user.avatar,
      role: user.role,
      companyName: user.companyName,
      companyDescription: user.companyDescription,
      companyWebsite: user.companyWebsite,
      companyImages: user.companyImages,
    };

    res.json({
      message: 'Upload ảnh công ty thành công!',
      images: uploadedUrls,
      user: userResponse
    });

  } catch (error) {
    console.error('❌ Lỗi uploadCompanyImages:', error);
    res.status(500).json({ message: 'Lỗi server khi upload ảnh.', error: error.message });
  }
};

// ========================================
// ✅ DELETE COMPANY IMAGE
// ========================================
// ========================================
// ADMIN: GET RECRUITER PROFILE BY ID
// ========================================
export const getRecruiterProfileById = async (req, res) => {
  try {
    const { recruiterId } = req.params;
    const adminId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(recruiterId)) {
      return res.status(400).json({ message: 'ID nhà tuyển dụng không hợp lệ.' });
    }

    const recruiter = await User.findById(recruiterId).select('-password');

    if (!recruiter) {
      return res.status(404).json({ message: 'Không tìm thấy nhà tuyển dụng.' });
    }

    if (recruiter.role !== 'recruiter') {
      return res.status(400).json({ message: 'Người dùng này không phải là nhà tuyển dụng.' });
    }

    console.log(`✅ Admin ${adminId} viewing recruiter profile: ${recruiterId}`);

    res.json({
      message: 'Lấy thông tin nhà tuyển dụng thành công.',
      recruiter
    });

  } catch (error) {
    console.error('❌ Lỗi getRecruiterProfileById:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy thông tin nhà tuyển dụng.' });
  }
};

export const deleteCompanyImage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || user.role !== 'recruiter') {
      return res.status(403).json({ message: 'Bạn không có quyền xóa ảnh công ty.' });
    }

    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ message: 'Vui lòng cung cấp URL ảnh cần xóa.' });
    }

    user.companyImages = (user.companyImages || []).filter(url => url !== imageUrl);
    await user.save();

    try {
      const publicId = imageUrl.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.v2.uploader.destroy(publicId);
      console.log(`✅ Deleted image from Cloudinary: ${publicId}`);
    } catch (cloudinaryError) {
      console.log('⚠️ Could not delete from Cloudinary:', cloudinaryError.message);
    }

    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      location: user.location,
      avatar: user.avatar,
      role: user.role,
      companyName: user.companyName,
      companyDescription: user.companyDescription,
      companyWebsite: user.companyWebsite,
      companyImages: user.companyImages,
    };

    res.json({
      message: 'Xóa ảnh thành công!',
      images: user.companyImages,
      user: userResponse
    });

  } catch (error) {
    console.error('❌ Lỗi deleteCompanyImage:', error);
    res.status(500).json({ message: 'Lỗi server khi xóa ảnh.', error: error.message });
  }
};