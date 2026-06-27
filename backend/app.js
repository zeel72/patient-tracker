import "dotenv/config";
import express from "express";
import { authenticate } from "./middleware/authMiddleware.js";
// auth
import signup from "./auth/signup.js";
import signin from "./auth/signin.js";
import setPassword from "./auth/setPassword.js";
import forgotPassword from "./auth/forgotPassword.js";
import resetPassword from "./auth/resetPassword.js";

// doctor
import addPatient from "./doctor/addPatient.js";
import retrievePatients from "./doctor/retrievePatients.js";
import getAllDoctors from "./doctor/getAllDoctors.js";
import assignPatient from "./doctor/assign-patient.js";
import removePatient from "./doctor/remove-patient.js";
import cors from "cors";
import prescription from "./doctor/prescription.js";
import { getMedicinesHandler } from "./utils/medicineData.js";
import { getPatientPrescriptions } from "./patient/prescriptions.js";
import deletePrescription from "./doctor/deletePrescription.js";
import { getPatientMedicationsTodayForDoctor } from "./doctor/medications.js";
import { getDoctorPrescriptionsByPatientId } from "./doctor/getPrescriptions.js";
import {
  getTodayMedications,
  updateMedicationStatus,
  getMedicationHistory,
  getMedicationAdherenceStats,
} from "./patient/medications.js";
// scheduler
import { initScheduler } from "./scheduleTasks.js";
import { triggerMedicationReminder } from "./middleware/MedicationReminder.js";
import { checkForMissedMedications, configureSocketIO } from "./middleware/MissedMedicationChecker.js";

// appointment controllers
import createAppointment from "./appointment/createAppointment.js";
import getDoctorAppointments from "./appointment/getDoctorAppointments.js";
import getPatientAppointments from "./appointment/getPatientAppointments.js";
import updateAppointmentStatus from "./appointment/updateAppointmentStatus.js";
import getAvailableSlots from "./appointment/getAvailableSlots.js";

// Import chat controllers
import { createChat, getChatsByDoctor, getChatsByPatient, getChatById } from "./chat/chatController.js";
import { createMessage, getMessagesByChatId } from "./chat/messageController.js";

import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

// initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // change in production
    methods: ["GET", "POST"]
  }
});

// Make io available globally for use in other modules
global.io = io;

// Configure the middleware with the Socket.io instance(if not done this then app.js will need middleware and socket.io )
configureSocketIO(io);

app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true
}));

app.use((req, res, next) => {
  triggerMedicationReminder().catch(console.error);
  next();
});

app.use(checkForMissedMedications);

app.get("/", (req, res) => {
  res.send("Server is running");
});
// authentication
app.post("/auth/signup", signup);
app.post("/auth/signin", signin);
app.post("/auth/set-password", setPassword);
app.post("/auth/forgot-password", forgotPassword);
app.post("/auth/reset-password", resetPassword);

// doctor (all protected)
app.get("/doctor/retrievePatients", authenticate, retrievePatients);
app.get("/doctor/doctors", authenticate, getAllDoctors);
app.post("/doctor/add-patient", authenticate, addPatient);
app.post("/doctor/prescription", authenticate, prescription);
app.post("/doctor/assign-patient", authenticate, assignPatient);
app.post("/doctor/remove-patient", authenticate, removePatient);
app.get("/doctor/prescriptions/:patientId", authenticate, getDoctorPrescriptionsByPatientId);
app.delete("/doctor/prescription/:prescriptionId", authenticate, deletePrescription);
app.get("/doctor/patient-medications/today/:patientId", authenticate, getPatientMedicationsTodayForDoctor);

// patient (all protected)
app.get("/patient/prescriptions/:patientId", authenticate, getPatientPrescriptions);  
app.get("/patient/medications/today/:patientId", authenticate, getTodayMedications);
app.post("/patient/medications/update-status", authenticate, updateMedicationStatus);
app.get("/patient/medications/history/:patientId", authenticate, getMedicationHistory);
app.get(
  "/patient/medications/adherence-stats/:patientId",
  authenticate,
  getMedicationAdherenceStats
);

// Medicine data endpoint
app.get("/api/medicines", getMedicinesHandler);

// Appointment endpoints (all protected)
app.post("/appointments", authenticate, createAppointment);
app.get("/doctor/appointments", authenticate, getDoctorAppointments);
app.get("/patient/appointments", authenticate, getPatientAppointments);
app.post("/appointments/update-status", authenticate, updateAppointmentStatus);
app.get("/appointments/available-slots", authenticate, getAvailableSlots);

// Chat endpoints (all protected)
app.post("/chats", authenticate, createChat);
app.get("/doctor/chats", authenticate, getChatsByDoctor);
app.get("/patient/chats", authenticate, getChatsByPatient);
app.get("/chats/:chatId", authenticate, getChatById);
app.post("/chats/:chatId/messages", authenticate, createMessage);
app.get("/chats/:chatId/messages", authenticate, getMessagesByChatId);

// Test endpoint to send medication reminders manually
app.post("/admin/send-medication-reminders", async (req, res) => {
  try {
    const { timeOfDay = "morning" } = req.body;
    const { sendReminders } = await import("./scheduleTasks.js");
    await sendReminders(timeOfDay);
    res.json({
      success: true,
      message: `${timeOfDay} medication reminders sent successfully`,
    });
  } catch (error) {
    console.error("Error sending medication reminders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  
  // Join a chat room
  socket.on("join-chat", (chatId) => {
    socket.join(chatId);
    console.log(`User ${socket.id} joined chat ${chatId}`);
  });
  
  // Leave a chat room
  socket.on("leave-chat", (chatId) => {
    socket.leave(chatId);
    console.log(`User ${socket.id} left chat ${chatId}`);
  });
  
  // Handle new message
  socket.on("send-message", async (messageData) => {
    try {
      // Broadcast to all users in the chat room
      io.to(messageData.chatId).emit("receive-message", messageData);
    } catch (error) {
      console.error("Error handling message:", error);
      socket.emit("error", { message: "Failed to process message" });
    }
  });
  
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(8000, () => {
  console.log("Server is running on port 8000");

  // Initialize the medication reminder scheduler
  initScheduler();
});

export default app;