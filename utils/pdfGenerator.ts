
import * as jspdfLib from "jspdf";
import { User } from "../types";

export const generateTrainerCardPDF = (user: User) => {
    try {
        // --- SAFE CONSTRUCTOR RESOLUTION ---
        // Intentamos encontrar el constructor de jsPDF en varias ubicaciones posibles
        // dependiendo de cómo el navegador/CDN haya cargado el módulo UMD.
        let JsPDFCtor: any = null;

        // @ts-ignore
        if (jspdfLib.jsPDF) {
            // @ts-ignore
            JsPDFCtor = jspdfLib.jsPDF;
        } 
        // @ts-ignore
        else if (jspdfLib.default && jspdfLib.default.jsPDF) {
            // @ts-ignore
            JsPDFCtor = jspdfLib.default.jsPDF;
        }
        // @ts-ignore
        else if (jspdfLib.default) {
            // @ts-ignore
            JsPDFCtor = jspdfLib.default;
        }

        if (!JsPDFCtor) {
            console.warn("jsPDF Library not fully loaded or compatible.", jspdfLib);
            alert("La funcionalidad de PDF no está disponible temporalmente (Librería no cargada).");
            return;
        }

        const doc = new JsPDFCtor({
            orientation: "portrait",
            unit: "mm",
            format: [90, 150] // Formato móvil vertical
        });

        const primaryColor = user.branding?.primaryColor || "#FF5B0B";
        const brandName = user.branding?.brandName || "MVP TRAINER";
        
        // Background
        doc.setFillColor(5, 5, 9); // MVP Black
        doc.rect(0, 0, 90, 150, "F");

        // Header Accent
        doc.setFillColor(primaryColor);
        doc.rect(0, 0, 90, 5, "F");

        // Logo / Profile Image
        if (user.publicProfile?.profileImageUrl) {
            try {
                // Asumiendo que es base64
                doc.addImage(user.publicProfile.profileImageUrl, "JPEG", 30, 20, 30, 30);
            } catch (e) {
                console.warn("Could not add image to PDF", e);
            }
        } else {
            doc.setFillColor(20, 20, 25);
            doc.circle(45, 35, 15, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(20);
            doc.text(user.displayName.charAt(0).toUpperCase(), 45, 37, { align: "center" });
        }

        // Name & Brand
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(brandName, 45, 60, { align: "center" });
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text(user.displayName, 45, 66, { align: "center" });

        // Services
        let yPos = 80;
        const services = user.publicProfile?.services || ["Entrenamiento Personal", "Asesoría Online"];
        
        services.slice(0, 4).forEach(service => {
            doc.setFillColor(30, 30, 35);
            doc.roundedRect(10, yPos, 70, 8, 2, 2, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.text(service, 45, yPos + 5.5, { align: "center" });
            yPos += 12;
        });

        // Contact
        doc.setTextColor(primaryColor);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("¡Entrena Conmigo!", 45, 130, { align: "center" });
        
        if (user.publicProfile?.whatsAppNumber) {
            doc.setTextColor(200, 200, 200);
            doc.setFontSize(10);
            doc.text(`WhatsApp: ${user.publicProfile.whatsAppNumber}`, 45, 136, { align: "center" });
        }

        doc.save(`${brandName.replace(/\s/g, '_')}_Card.pdf`);

    } catch (e) {
        console.error("Critical PDF Generation Error:", e);
        alert("Lo sentimos, ocurrió un error técnico al generar el PDF. Por favor intenta más tarde.");
    }
};
