const db = require("../config/db");
const axios = require("axios");
const uploadBufferToCloudinary = require("../helpers/cloudinary");
const { sendApplicationConfirmationEmail } = require("../helpers/email");

const APPLICATION_FORM_FEE = 11500;
const APPLICATION_FORM_CURRENCY = "NGN";
const FLW_BASE_URL = process.env.FLW_BASE_URL || "https://api.flutterwave.com/v3";

function getFlutterwaveHeaders() {
  return {
    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

function getFrontendFormUrl() {
  return process.env.FRONTEND_FORM_URL || `${process.env.DOMAIN_NAME}/form`;
}

const applicationController = {
  async initializeApplicationPayment(req, res) {
    const userId = req.user.id;

    if (!process.env.FLW_SECRET_KEY) {
      return res.status(500).json({
        status: 500,
        message: "Flutterwave is not configured on the server.",
      });
    }

    try {
      const userResult = await db.query(
        `SELECT id, email, full_name, admission_form_payment_status
         FROM users
         WHERE id = $1`,
        [userId]
      );

      const user = userResult.rows[0];

      if (!user) {
        return res.status(404).json({
          status: 404,
          message: "User not found.",
        });
      }

      if (user.admission_form_payment_status === "paid") {
        return res.status(200).json({
          status: 200,
          already_paid: true,
          message: "Application form fee has already been paid.",
        });
      }

      const txRef = `ocoam-form-${userId}-${Date.now()}`;
      const payload = {
        tx_ref: txRef,
        amount: APPLICATION_FORM_FEE,
        currency: APPLICATION_FORM_CURRENCY,
        redirect_url: getFrontendFormUrl(),
        customer: {
          email: user.email,
          name: user.full_name,
        },
        customizations: {
          title: "OCOAM Admission Form Payment",
          description: "Payment for the OCOAM admission form",
        },
        meta: {
          user_id: String(userId),
          fee_type: "admission_form",
        },
      };

      const paymentResponse = await axios.post(
        `${FLW_BASE_URL}/payments`,
        payload,
        { headers: getFlutterwaveHeaders() }
      );

      const paymentLink = paymentResponse?.data?.data?.link;

      if (!paymentLink) {
        return res.status(502).json({
          status: 502,
          message: "Flutterwave did not return a payment link.",
        });
      }

      await db.query(
        `UPDATE users
         SET admission_form_payment_status = $1,
             admission_form_payment_amount = $2,
             admission_form_payment_currency = $3,
             admission_form_payment_tx_ref = $4,
             admission_form_payment_transaction_id = NULL,
             admission_form_paid_at = NULL
         WHERE id = $5`,
        ["pending", APPLICATION_FORM_FEE, APPLICATION_FORM_CURRENCY, txRef, userId]
      );

      return res.status(200).json({
        status: 200,
        payment_link: paymentLink,
        tx_ref: txRef,
        amount: APPLICATION_FORM_FEE,
        currency: APPLICATION_FORM_CURRENCY,
      });
    } catch (error) {
      console.error("Flutterwave initialize payment error:", error.response?.data || error);
      return res.status(500).json({
        status: 500,
        message: "Unable to initialize payment. Please try again.",
      });
    }
  },

  async verifyApplicationPayment(req, res) {
    const userId = req.user.id;
    const { transaction_id, tx_ref } = req.body;

    if (!process.env.FLW_SECRET_KEY) {
      return res.status(500).json({
        status: 500,
        message: "Flutterwave is not configured on the server.",
      });
    }

    if (!tx_ref) {
      return res.status(400).json({
        status: 400,
        message: "tx_ref is required.",
      });
    }

    try {
      const userResult = await db.query(
        `SELECT id, admission_form_payment_status, admission_form_payment_tx_ref
         FROM users
         WHERE id = $1`,
        [userId]
      );

      const user = userResult.rows[0];

      if (!user) {
        return res.status(404).json({
          status: 404,
          message: "User not found.",
        });
      }

      const verificationResponse = transaction_id
        ? await axios.get(
            `${FLW_BASE_URL}/transactions/${transaction_id}/verify`,
            { headers: getFlutterwaveHeaders() }
          )
        : await axios.get(
            `${FLW_BASE_URL}/transactions/verify_by_reference`,
            {
              headers: getFlutterwaveHeaders(),
              params: { tx_ref },
            }
          );

      const verifiedTransaction = verificationResponse?.data?.data;
      const verifiedStatus = verifiedTransaction?.status;
      const verifiedAmount = Number(verifiedTransaction?.amount || 0);
      const verifiedCurrency = verifiedTransaction?.currency;
      const verifiedTxRef = verifiedTransaction?.tx_ref;
      const verifiedTransactionId = verifiedTransaction?.id || transaction_id;

      const isValidPayment =
        verifiedStatus === "successful" &&
        verifiedAmount >= APPLICATION_FORM_FEE &&
        verifiedCurrency === APPLICATION_FORM_CURRENCY &&
        verifiedTxRef === tx_ref &&
        user.admission_form_payment_tx_ref === tx_ref;

      if (!isValidPayment) {
        await db.query(
          `UPDATE users
           SET admission_form_payment_status = $1
           WHERE id = $2`,
          ["failed", userId]
        );

        return res.status(400).json({
          status: 400,
          message: "Payment could not be verified.",
        });
      }

      const paidAt = new Date().toISOString();

      await db.query(
        `UPDATE users
         SET admission_form_payment_status = $1,
             admission_form_payment_amount = $2,
             admission_form_payment_currency = $3,
             admission_form_payment_tx_ref = $4,
             admission_form_payment_transaction_id = $5,
             admission_form_paid_at = $6
         WHERE id = $7`,
        [
          "paid",
          APPLICATION_FORM_FEE,
          APPLICATION_FORM_CURRENCY,
          tx_ref,
          verifiedTransactionId ? String(verifiedTransactionId) : null,
          paidAt,
          userId,
        ]
      );

      return res.status(200).json({
        status: 200,
        message: "Payment verified successfully.",
        payment_status: "paid",
        amount: APPLICATION_FORM_FEE,
      });
    } catch (error) {
      console.error("Flutterwave verify payment error:", error.response?.data || error);
      return res.status(500).json({
        status: 500,
        message: "Unable to verify payment. Please try again.",
      });
    }
  },

  async submitApplication(req, res) {
    const userId = req.user.id;
    const userEmail = req.user.email;

    try {
      const paymentStatusResult = await db.query(
        `SELECT admission_form_payment_status
         FROM users
         WHERE id = $1`,
        [userId]
      );

      const paymentStatus = paymentStatusResult.rows[0]?.admission_form_payment_status;

      if (paymentStatus !== "paid") {
        return res.status(402).json({
          status: 402,
          message: "Please pay the application form fee before submitting.",
        });
      }

      // Check if user already submitted an application
      const existingApplication = await db.query(
        "SELECT id FROM applications WHERE user_id = $1",
        [userId]
      );

      if (existingApplication.rows.length > 0) {
        return res.status(409).json({
          status: 409,
          message: "You have already submitted an application.",
        });
      }

      // Validate required fields
      const {
        programme,
        surname,
        firstname,
        dob,
        gender,
        state_of_origin,
        lga,
        marital_status,
        residential_address,
        phone_number,
        email,
        qualification_route,
        motivation,
        nok_name,
        nok_relationship,
        nok_phone,
        nok_address,
        payment_option,
        othername,
        alternative_phone,
        whatsapp_number,
        highest_qualification,
        institution_name,
        graduation_year,
        experience_years,
        tm_background,
        tm_experience,
        nok_email,
      } = req.body;

      // Validate required fields
      if (
        !programme ||
        !surname ||
        !firstname ||
        !dob ||
        !gender ||
        !state_of_origin ||
        !lga ||
        !marital_status ||
        !residential_address ||
        !phone_number ||
        !email ||
        !qualification_route ||
        !motivation ||
        !nok_name ||
        !nok_relationship ||
        !nok_phone ||
        !nok_address ||
        !payment_option
      ) {
        return res.status(400).json({
          status: 400,
          message: "All required fields must be filled.",
        });
      }

      // Validate programme selection
      if (!["professional", "advanced"].includes(programme)) {
        return res.status(400).json({
          status: 400,
          message: "Invalid programme selection.",
        });
      }

      // Validate gender
      if (!["male", "female"].includes(gender)) {
        return res.status(400).json({
          status: 400,
          message: "Invalid gender selection.",
        });
      }

      // Validate marital status
      if (!["single", "married", "divorced", "widowed"].includes(marital_status)) {
        return res.status(400).json({
          status: 400,
          message: "Invalid marital status.",
        });
      }

      // Validate qualification route
      if (!["academic", "practice"].includes(qualification_route)) {
        return res.status(400).json({
          status: 400,
          message: "Invalid qualification route.",
        });
      }

      // Validate payment option
      if (!["full", "three", "four"].includes(payment_option)) {
        return res.status(400).json({
          status: 400,
          message: "Invalid payment option.",
        });
      }

      // Validate required documents
      if (!req.files || !req.files.passport_photo || !req.files.birth_certificate_or_attestation) {
        return res.status(400).json({
          status: 400,
          message: "Passport photo and birth certificate/attestation are required.",
        });
      }

      // If academic route, school certificate is required
      if (qualification_route === "academic" && !req.files.school_certificate) {
        return res.status(400).json({
          status: 400,
          message: "School certificate is required for academic route.",
        });
      }

      // Upload documents to Cloudinary
      const documentUrls = {};
      const uploadedUrls = []; // Track uploads for rollback

      try {
        // Upload passport photo
        const passportPhotoUrl = await uploadBufferToCloudinary(
          req.files.passport_photo[0].buffer
        );
        documentUrls.passport_photo_url = passportPhotoUrl;
        uploadedUrls.push(passportPhotoUrl);

        // Upload birth certificate or attestation
        const birthCertUrl = await uploadBufferToCloudinary(
          req.files.birth_certificate_or_attestation[0].buffer
        );
        documentUrls.birth_certificate_or_attestation_url = birthCertUrl;
        uploadedUrls.push(birthCertUrl);

        // Upload school certificate if provided
        if (req.files.school_certificate) {
          const schoolCertUrl = await uploadBufferToCloudinary(
            req.files.school_certificate[0].buffer
          );
          documentUrls.school_certificate_url = schoolCertUrl;
          uploadedUrls.push(schoolCertUrl);
        }

        // Upload practice documentation if provided
        if (req.files.practice_documentation) {
          const practiceDocUrl = await uploadBufferToCloudinary(
            req.files.practice_documentation[0].buffer
          );
          documentUrls.practice_documentation_url = practiceDocUrl;
          uploadedUrls.push(practiceDocUrl);
        }

        // Upload medical fitness certificate if provided
        if (req.files.medical_fitness_certificate) {
          const medicalCertUrl = await uploadBufferToCloudinary(
            req.files.medical_fitness_certificate[0].buffer
          );
          documentUrls.medical_fitness_certificate_url = medicalCertUrl;
          uploadedUrls.push(medicalCertUrl);
        }

        // Upload recommendation letter if provided
        if (req.files.recommendation_letter) {
          const recLetterUrl = await uploadBufferToCloudinary(
            req.files.recommendation_letter[0].buffer
          );
          documentUrls.recommendation_letter_url = recLetterUrl;
          uploadedUrls.push(recLetterUrl);
        }

        // Upload additional certificates if provided
        if (req.files.additional_certificates) {
          const additionalCertsUrl = await uploadBufferToCloudinary(
            req.files.additional_certificates[0].buffer
          );
          documentUrls.additional_certificates_url = additionalCertsUrl;
          uploadedUrls.push(additionalCertsUrl);
        }
      } catch (uploadError) {
        console.error("Document upload error:", uploadError);
        // Rollback: Note - In production, you might want to delete uploaded files from Cloudinary
        return res.status(500).json({
          status: 500,
          message: "Failed to upload documents. Please try again.",
          error: uploadError.message,
        });
      }

      // Calculate pioneer discount (first 20 applicants)
      const applicationsCount = await db.query(
        "SELECT COUNT(*) as count FROM applications"
      );
      const count = parseInt(applicationsCount.rows[0].count);
const pioneer_discount_applied = count < 20 ? 1 : 0;
      // Get current timestamp
      const now = new Date();
      const createdAt = now.toISOString();
      const updatedAt = createdAt;

      // Insert application into database
      const result = await db.query(
        `INSERT INTO applications (
          user_id, programme, surname, firstname, othername, dob, gender,
          state_of_origin, lga, marital_status, residential_address,
          phone_number, alternative_phone, email, whatsapp_number,
          qualification_route, highest_qualification, institution_name,
          graduation_year, experience_years, tm_background, tm_experience,
          motivation, nok_name, nok_relationship, nok_phone, nok_email,
          nok_address, payment_option, pioneer_discount_applied,
          passport_photo_url, birth_certificate_or_attestation_url,
          school_certificate_url, practice_documentation_url,
          medical_fitness_certificate_url, recommendation_letter_url,
          additional_certificates_url, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
          $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39
        ) RETURNING id`,
        [
          userId,
          programme,
          surname,
          firstname,
          othername || null,
          dob,
          gender,
          state_of_origin,
          lga,
          marital_status,
          residential_address,
          phone_number,
          alternative_phone || null,
          email,
          whatsapp_number || null,
          qualification_route,
          highest_qualification || null,
          institution_name || null,
          graduation_year || null,
          experience_years || null,
          tm_background || null,
          tm_experience || null,
          motivation,
          nok_name,
          nok_relationship,
          nok_phone,
          nok_email || null,
          nok_address,
          payment_option,
          pioneer_discount_applied,
          documentUrls.passport_photo_url,
          documentUrls.birth_certificate_or_attestation_url,
          documentUrls.school_certificate_url || null,
          documentUrls.practice_documentation_url || null,
          documentUrls.medical_fitness_certificate_url || null,
          documentUrls.recommendation_letter_url || null,
          documentUrls.additional_certificates_url || null,
          createdAt,
          updatedAt,
        ]
      );

      const applicationId = result.rows[0].id;

      // Send confirmation email
      try {
        await sendApplicationConfirmationEmail(userEmail, applicationId, pioneer_discount_applied, programme);
      } catch (emailError) {
        console.error("Email sending error:", emailError);
        // Don't fail the request if email fails
      }

      res.status(201).json({
        status: 201,
        message: "Application submitted successfully!",
        application_id: applicationId,
        pioneer_discount_applied,
      });
    } catch (error) {
      console.error("Application submission error:", error);
      res.status(500).json({
        status: 500,
        message: "Failed to submit application. Please try again.",
        error: error.message,
      });
    }
  },

  async checkApplicationStatus(req, res) {
    const userId = req.user.id;

    try {
      const userResult = await db.query(
        `SELECT admission_form_payment_status, admission_form_payment_amount,
                admission_form_payment_currency, admission_form_payment_tx_ref,
                admission_form_payment_transaction_id, admission_form_paid_at
         FROM users
         WHERE id = $1`,
        [userId]
      );

      const user = userResult.rows[0];

      if (!user) {
        return res.status(404).json({
          status: 404,
          message: "User not found.",
        });
      }

      const application = await db.query(
        "SELECT id, created_at, pioneer_discount_applied FROM applications WHERE user_id = $1",
        [userId]
      );

      res.status(200).json({
        status: 200,
        has_applied: application.rows.length > 0,
        application: application.rows[0] || null,
        payment: {
          status: user.admission_form_payment_status || "unpaid",
          has_paid: user.admission_form_payment_status === "paid",
          amount: user.admission_form_payment_amount || 0,
          currency: user.admission_form_payment_currency || APPLICATION_FORM_CURRENCY,
          tx_ref: user.admission_form_payment_tx_ref || null,
          transaction_id: user.admission_form_payment_transaction_id || null,
          paid_at: user.admission_form_paid_at || null,
        },
      });
    } catch (error) {
      console.error("Check application status error:", error);
      res.status(500).json({
        status: 500,
        message: "Failed to check application status.",
        error: error.message,
      });
    }
  },
};

module.exports = applicationController;
