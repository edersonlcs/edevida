const express = require("express");
const multer = require("multer");
const {
  usersListController,
  userProfileUpsertController,
  userProfileGetController,
  userGoalCreateController,
  userGoalListController,
  bodyMeasurementCreateController,
  bodyMeasurementProgressPhotoUploadController,
  bodyMeasurementListController,
  bioimpedanceCreateController,
  bioimpedanceUploadController,
  bioimpedanceListController,
  medicalExamCreateController,
  medicalExamUploadController,
  medicalExamListController,
  hydrationCreateController,
  hydrationListController,
  workoutCreateController,
  workoutListController,
  nutritionListController,
  nutritionTextAnalyzeController,
  nutritionImageAnalyzeController,
  nutritionAudioAnalyzeController,
  nutritionRegisterDraftController,
  nutritionChatController,
  reportGenerateController,
  reportListController,
  dashboardOverviewController,
  workoutRecommendationController,
} = require("../controllers/trackingController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get("/api/users", usersListController);

router.get("/api/profile", userProfileGetController);
router.post("/api/profile", userProfileUpsertController);

router.get("/api/goals", userGoalListController);
router.post("/api/goals", userGoalCreateController);

router.get("/api/measurements", bodyMeasurementListController);
router.post("/api/measurements", bodyMeasurementCreateController);
router.post("/api/measurements/progress-photo", upload.single("file"), bodyMeasurementProgressPhotoUploadController);

router.get("/api/bioimpedance", bioimpedanceListController);
router.post("/api/bioimpedance", bioimpedanceCreateController);
router.post("/api/bioimpedance/upload", upload.single("file"), bioimpedanceUploadController);

router.get("/api/medical-exams", medicalExamListController);
router.post("/api/medical-exams", medicalExamCreateController);
router.post("/api/medical-exams/upload", upload.single("file"), medicalExamUploadController);

router.get("/api/hydration", hydrationListController);
router.post("/api/hydration", hydrationCreateController);

router.get("/api/workouts", workoutListController);
router.post("/api/workouts", workoutCreateController);
router.get("/api/workouts/recommendation", workoutRecommendationController);

router.get("/api/nutrition", nutritionListController);
router.post("/api/nutrition/analyze-text", nutritionTextAnalyzeController);
router.post("/api/nutrition/analyze-image", upload.single("file"), nutritionImageAnalyzeController);
router.post("/api/nutrition/analyze-audio", upload.single("file"), nutritionAudioAnalyzeController);
router.post("/api/nutrition/register-draft", nutritionRegisterDraftController);
router.post("/api/nutrition/chat", nutritionChatController);

router.get("/api/reports", reportListController);
router.post("/api/reports/generate", reportGenerateController);

router.get("/api/dashboard/overview", dashboardOverviewController);

module.exports = {
  trackingRoutes: router,
};
