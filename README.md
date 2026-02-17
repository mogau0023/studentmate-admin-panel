# StudentMATE Admin Panel

The **StudentMATE Admin Panel** is the centralized control hub for managing educational content for the StudentMATE mobile application. It allows administrators to manage universities, modules, assessments (exams, tests, supplementary exams), users, and announcements.

Built with **React**, **TypeScript**, **Tailwind CSS**, and **Firebase** (Firestore, Auth, Storage).

## 🚀 Features

### 1. Dashboard
- **Real-time Statistics**: View total counts of uploaded exams, tests, and supplementary exams.
- **Recent Uploads**: Track the latest content added to the system.
- **Quick Navigation**: Jump to specific universities or manage assessments directly.

### 2. University Management
- **Add Universities**: Create new university profiles with Name, Code (e.g., UP, WITS), and Logo.
- **Manage Universities**: View list of all universities, edit details, or delete them.

### 3. Module Management
- **Course Modules**: Add modules (subjects) to specific universities (e.g., "SMTH011 - Calculus 1" under "University of Pretoria").
- **Organization**: Modules are strictly linked to universities to ensure data integrity.

### 4. Assessment Management (Core Feature)
- **Three Types**: Manage **Exams**, **Tests**, and **Supplementary Exams** separately.
- **Flexible Content**:
    - **PDF Upload**: Upload full question papers as PDFs.
    - **Question Builder**: Create assessments question-by-question.
        - Upload **Question Images** (for complex math/diagrams).
        - Upload **Answer Images** (hidden by default in student app).
        - Add **Video Solution URLs** (YouTube/Vimeo links).
        - Assign **Marks** per question.

### 5. User Management
- **View Users**: See a list of all registered students.
- **Filter**: Filter users by university.
- **Search**: Find specific users by name or email.

### 6. Announcements
- **System-wide Alerts**: Create announcements visible to students in the mobile app.
- **Targeting**: Send announcements to all users or target a specific university.
- **Status Control**: Toggle announcements as Active/Inactive.

### 7. Analytics
- **Overview**: (Placeholder) Future-ready section for viewing user engagement and download statistics.

---

## 🛠 Prerequisites

- **Node.js** (v18 or higher)
- **Firebase Project**: You need a Firebase project with Authentication, Firestore, and Storage enabled.

---

## 📦 Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd studentmate-admin-panel
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Environment Configuration**
    The Firebase configuration is located in `src/lib/firebase.ts`. Ensure the keys match your Firebase project.

4.  **Run Development Server**
    ```bash
    npm run dev
    ```
    Open [http://localhost:5173](http://localhost:5173).

---

## 🔥 Firebase Configuration

To make the app work securely, you must configure Firebase correctly.

### 1. Authentication
*   Enable **Email/Password** sign-in method in the Firebase Console.

### 2. Firestore Security Rules
Go to **Firestore Database > Rules** and paste the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user is an admin
    function isAdmin() {
      return request.auth != null && 
        exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }
    
    // Helper function to check if user is a university admin for specific university
    function isUniversityAdmin(universityId) {
      return isAdmin() && (
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'superadmin' ||
        (get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'university_admin' &&
         get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.universityId == universityId)
      );
    }

    // Admins collection: Users can read their own profile to check role
    match /admins/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false; // Only manually created in console
    }

    // Universities: Read by admins, Write by Super Admin
    match /universities/{universityId} {
      allow read: if isAdmin();
      allow write: if isAdmin() && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'superadmin';
    }

    // Modules: Read by admins, Write by University Admin
    match /modules/{moduleId} {
      allow read: if isAdmin();
      allow write: if isUniversityAdmin(request.resource.data.universityId);
    }

    // Assessments: Read by admins, Write by University Admin
    match /assessments/{assessmentId} {
      allow read: if isAdmin();
      allow write: if isUniversityAdmin(request.resource.data.universityId);
      
      // Allow access to questions sub-collection
      match /questions/{questionId} {
        allow read: if isAdmin();
        allow write: if isUniversityAdmin(get(/databases/$(database)/documents/assessments/$(assessmentId)).data.universityId);
      }
    }

    // Users: Read by admins
    match /users/{userId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }

    // Announcements: Read by admins, Write by admins
    match /announcements/{announcementId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }
  }
}
```

### 3. Storage Security Rules
Go to **Storage > Rules** and paste the following:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAdmin() {
      return request.auth != null && 
        firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid));
    }

    // Assessments (PDFs)
    match /assessments/{allPaths=**} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Question/Answer Images
    match /questions/{allPaths=**} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // University Logos
    match /university-logos/{allPaths=**} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

### 4. Create Initial Admin (CRITICAL)
Since registration is closed to the public, you must manually create the first **Super Admin**:

1.  Go to **Firebase Console > Authentication** -> **Add user**.
2.  Create a user (e.g., `admin@studentmate.com` / `password123`).
3.  Copy the **User UID** of the new user.
4.  Go to **Firestore Database**.
5.  Create a collection named `admins`.
6.  Add a document where **Document ID** = **User UID**.
7.  Add fields:
    *   `adminId` (string): same as User UID
    *   `email` (string): `admin@studentmate.com`
    *   `role` (string): `superadmin`

Now you can log in to the admin panel.

---

## 📖 Usage Guide

### How to Add Content
1.  **Add University**: Go to **Manage Universities** -> **Add University**. Upload a logo and enter the code (e.g., UP).
2.  **Add Module**: Go to **Modules**. Select the University, then click **Add Module**. Enter code (e.g., SMTH011) and name.
3.  **Add Assessment**:
    *   Go to **Exams**, **Tests**, or **Supp. Exams**.
    *   Click **Create Exam**.
    *   Select University & Module.
    *   Enter Title (e.g., "Semester Test 1") and Year.
    *   (Optional) Upload the full PDF paper.
    *   Click **Create**.
4.  **Add Questions** (Detailed Mode):
    *   In the assessment list, click the **Questions** button (list icon).
    *   Click **Add Question**.
    *   Enter Title ("Question 1") and Marks.
    *   **Upload Question Image**: Screenshot of the question.
    *   **Upload Answer Image**: Screenshot of the solution (optional).
    *   **Video URL**: Link to a solution video (optional).
    *   Save.

---

## 📂 Project Structure

- `src/components`: Reusable UI components (Layout, Sidebar, Modal, QuestionManager).
- `src/pages`: Main views (Dashboard, Universities, Modules, Assessments).
- `src/services`: Firebase interaction logic (separated from UI).
- `src/store`: Global state management (Zustand) for Auth.
- `src/types`: TypeScript interfaces for data models.
- `src/lib`: Configuration files.

---

## 🚢 Deployment

To build for production:

```bash
npm run build
```

This creates a `dist` folder that you can deploy to **Firebase Hosting**, **Vercel**, or **Netlify**.
