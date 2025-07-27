import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router";
import './index.css'
import PixieBridge from './App.jsx'
import Endless from './components/endless.jsx'
import Pixie from './components/pixie.jsx'

let router = createBrowserRouter([
    {
        path: "/",
        Component: PixieBridge,
    },
    {
        path: "/test/pixie",
        Component: Pixie
    },
    {
        path: "/test/endless",
        Component: Endless
    },
]);

createRoot(document.getElementById("root")).render(
    <RouterProvider router={router} />,
);
