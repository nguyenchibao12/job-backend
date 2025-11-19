// server/models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  // Thông tin cơ bản (bắt buộc khi đăng ký)
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, default: '' },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["student", "recruiter", "admin"], default: "student" },
  companyImages: {
  type: [String],
  default: [],
  validate: {
    validator: function(arr) {
      return arr.length <= 6; // Tối đa 6 ảnh
    },
    message: 'Tối đa 6 ảnh công ty.'
  }
},
  // Thông tin profile chung
  location: { type: String, default: '' },
  avatar: { type: String, default: null },
  about: { type: String, default: '' },
  
  // ✅ STUDENT FIELDS - Các trường cho sinh viên
  education: [{
    school: { type: String, default: '' },
    major: { type: String, default: '' },
    period: { type: String, default: '' },
    gpa: { type: String, default: '' }
  }],
  
  experience: [{
    company: { type: String, default: '' },
    position: { type: String, default: '' },
    period: { type: String, default: '' },
    description: { type: String, default: '' }
  }],
  
  skills: [{ type: String }],
  
  languages: [{
    name: { type: String, default: '' },
    level: { type: String, default: '' }
  }],
  
  // ✅ RECRUITER FIELDS - Các trường cho nhà tuyển dụng
  companyName: { type: String, default: '' },
  companyDescription: { type: String, default: '' },
  companyWebsite: { type: String, default: '' },
  companyAddress: { type: String, default: '' }, // Địa chỉ chi tiết
  companySize: { type: String, default: '' }, // Quy mô công ty (VD: 10-50 nhân viên)
  companyFoundedYear: { type: Number, default: null }, // Năm thành lập
  companyIndustry: { type: String, default: '' }, // Lĩnh vực hoạt động
  companyFacebook: { type: String, default: '' }, // Link Facebook
  companyLinkedIn: { type: String, default: '' }, // Link LinkedIn
  companyWorkingHours: { type: String, default: '' }, // Giờ làm việc
  companyCulture: { type: String, default: '' }, // Văn hóa công ty
  
  // Reset password tokens
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },
  
}, { 
  timestamps: true // Tự động thêm createdAt và updatedAt
});

const User = mongoose.model("User", userSchema);
export default User;