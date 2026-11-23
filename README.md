# MHUTEMP Frontend Application

## Version 2026 - ESP32
<img width="1264" height="1037" alt="image" src="https://github.com/user-attachments/assets/d66ce999-ddaf-4f11-bc91-1b69b3681f8f" />


This is the frontend application of the **MHUTEMP** project, providing a real-time dashboard and historical data view for temperature and humidity monitoring.

## 🚀 Features

- Real-time data updates every 2 seconds using WebSocket.
- Historical data view with date-based filtering.
- Responsive web dashboard design.
- Visualisation of temperature and humidity charts.

## 🔧 Technologies Used

- Next.js (React.js framework)
- Chart.js or Recharts (for graph visualisation)
- WebSocket Client
- Axios (for API requests)

## 🛠️ Installation

1. Clone this repository:
```sh
git clone https://github.com/storres20/bio-data-nextjs-pro.git
```

2. Install dependencies:
```sh
pnpm install
```


3. Set the backend API URL in `.env.local`. For local development, run the backend with `PORT=3001`.

```dotenv
NEXT_PUBLIC_API_BASE_RAILWAY=http://localhost:3001
```


4. Run the development server:
```sh
pnpm dev
```

## 📚 Related Repositories

- [MHUTEMP Backend Server (Node.js)](https://github.com/storres20/bio-data-pro)

## Hospital area access

Deploy the matching frontend and backend versions together. Set a private `JWT_SECRET` in Railway before users sign in.

Existing accounts retain their previous area until an administrator updates their permissions. New accounts can sign in to see a pending area request. An administrator can grant or revoke access from **Manage Access**.

An operator with database access provisions administrator roles on existing, verified accounts. Set the user's `role` to `hospital-admin` to manage accounts in that user's hospital or to `web-admin` for all hospitals. An administrator's monitoring feed still uses the areas assigned to that account.

Add areas that have no registered equipment to the hospital's `area_ids` in MongoDB. The backend also recognizes area assignments from existing equipment and legacy accounts. Mobile clients that read live data or register for push notifications must authenticate against the new API and WebSocket.

## 📜 License

This project is licensed under the MIT License.  
See the [LICENSE](https://github.com/storres20/bio-data-nextjs-pro/blob/main/LICENSE.txt) file for more details.

## Version 2025 - ESP8266
![temphuweb01](https://github.com/user-attachments/assets/870c6bcf-cf79-4070-8070-e88729208b78)

![temphuweb02](https://github.com/user-attachments/assets/898a73b8-ffe2-40b0-bf5e-bf582ad51f7f)

