package org.citizen.caste.service;

import com.itextpdf.text.*;
import com.itextpdf.text.pdf.PdfPCell;
import com.itextpdf.text.pdf.PdfPTable;
import com.itextpdf.text.pdf.PdfWriter;
import org.citizen.caste.model.ApplicationResponse;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Service
public class CertificatePdfService {

    private static final Font TITLE_FONT = new Font(Font.FontFamily.HELVETICA, 18, Font.BOLD, new BaseColor(26, 35, 126));
    private static final Font HEADER_FONT = new Font(Font.FontFamily.HELVETICA, 12, Font.BOLD);
    private static final Font BODY_FONT = new Font(Font.FontFamily.HELVETICA, 11);
    private static final Font SMALL_FONT = new Font(Font.FontFamily.HELVETICA, 9, Font.ITALIC, BaseColor.GRAY);

    public byte[] generate(ApplicationResponse app, String aadhaarRef) throws DocumentException {
        Document doc = new Document(PageSize.A4, 50, 50, 60, 50);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter.getInstance(doc, out);
        doc.open();

        Paragraph header = new Paragraph("Government of Gujarat", TITLE_FONT);
        header.setAlignment(Element.ALIGN_CENTER);
        doc.add(header);
        Paragraph sub = new Paragraph("Revenue Department — Caste Certificate", HEADER_FONT);
        sub.setAlignment(Element.ALIGN_CENTER);
        sub.setSpacingAfter(20);
        doc.add(sub);

        doc.add(new Paragraph("Certificate of Caste", new Font(Font.FontFamily.HELVETICA, 14, Font.BOLD)));
        doc.add(Chunk.NEWLINE);

        PdfPTable table = new PdfPTable(2);
        table.setWidthPercentage(100);
        table.setSpacingBefore(10);
        table.setSpacingAfter(20);

        addRow(table, "Applicant Name", app.applicantName());
        addRow(table, "Aadhaar", maskAadhaar(aadhaarRef));
        addRow(table, "Caste Category", app.casteCode());
        addRow(table, "Certificate No.", app.engineRef());
        addRow(table, "Issue Date", LocalDate.now().format(DateTimeFormatter.ofPattern("dd-MMM-yyyy")));
        addRow(table, "Tenant / Taluka", app.tenantId());
        doc.add(table);

        Paragraph body = new Paragraph(
                "This is to certify that the above-named citizen belongs to the "
                        + app.casteCode() + " category as per village revenue records.",
                BODY_FONT);
        body.setSpacingAfter(16);
        doc.add(body);

        Paragraph qr = new Paragraph("[ QR Verification Code Placeholder ]", SMALL_FONT);
        qr.setAlignment(Element.ALIGN_CENTER);
        qr.setSpacingAfter(30);
        doc.add(qr);

        Paragraph sign = new Paragraph("Mamlatdar / Revenue Officer\nDigital Gujarat Platform", BODY_FONT);
        sign.setAlignment(Element.ALIGN_RIGHT);
        doc.add(sign);

        doc.close();
        return out.toByteArray();
    }

    private static void addRow(PdfPTable table, String label, String value) {
        PdfPCell l = new PdfPCell(new Phrase(label, HEADER_FONT));
        l.setBorder(Rectangle.NO_BORDER);
        l.setPaddingBottom(6);
        PdfPCell v = new PdfPCell(new Phrase(value != null ? value : "—", BODY_FONT));
        v.setBorder(Rectangle.NO_BORDER);
        v.setPaddingBottom(6);
        table.addCell(l);
        table.addCell(v);
    }

    private static String maskAadhaar(String ref) {
        if (ref == null || ref.isBlank()) return "XXXX-XXXX-XXXX";
        String digits = ref.replaceAll("[^0-9]", "");
        if (digits.length() >= 4) {
            return "XXXX-XXXX-" + digits.substring(digits.length() - 4);
        }
        return ref;
    }
}
