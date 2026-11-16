import { eq } from "drizzle-orm";
import { db, closeDbConnection } from "../index.js";
import {
  heroSlides,
  tentangProfile,
  tentangPillars,
  partners,
  kaderBusinesses,
  achievements,
  workProgramBidangs,
  compartmentStages,
  programSlides,
  testimonials,
  siteSettings,
  announcements,
} from "../schema/cms.js";

/**
 * Idempotent CMS seeder populating initial UKM Profile content
 * matching hipmi-pt-telkom-web baseline and BACKEND-REQUIREMENTS.md limits.
 */
export async function seedCmsData(targetDb: any = db) {
  console.log("Starting CMS data seeding...");

  // 1. Hero Slides
  const existingSlides = await targetDb.query.heroSlides.findMany();
  if (existingSlides.length === 0) {
    await targetDb.insert(heroSlides).values([
      {
        indexLabel: "01 / 05",
        title: "HIPMI PT UNIVERSITAS TELKOM",
        subtitle:
          "Wadah pengembangan pengusaha muda Universitas Telkom melalui inkubasi bisnis kader, jejaring kemitraan strategis, dan program kerja berdampak.",
        imageSrc: "/assets/01-hero-home/hero-slide-01.jpg",
        imageAlt:
          "Mahasiswa pengusaha Universitas Telkom berkolaborasi membahas konsep usaha di ruang kerja kreatif",
        sortOrder: 1,
        isPublished: true,
      },
      {
        indexLabel: "02 / 05",
        title: "KOLABORASI & JEJARING WIRAUSAHA",
        subtitle:
          "Menghubungkan founder mahasiswa dengan ekosistem pengusaha muda nasional untuk mempercepat validasi dan pertumbuhan bisnis.",
        imageSrc: "/assets/01-hero-home/hero-slide-02.jpg",
        imageAlt:
          "Diskusi kelompok kader wirausaha mahasiswa HIPMI PT Universitas Telkom bersama laptop dan rancangan produk",
        sortOrder: 2,
        isPublished: true,
      },
      {
        indexLabel: "03 / 05",
        title: "INKUBASI & MENTORING PRAKTISI",
        subtitle:
          "Pendampingan bisnis terstruktur bersama mentor dan alumni agar usaha kader naik kelas secara operasional dan finansial.",
        imageSrc: "/assets/01-hero-home/hero-slide-03.jpg",
        imageAlt:
          "Sesi mentoring bisnis antara mentor praktisi dan mahasiswa kader di ruang auditorium inovasi",
        sortOrder: 3,
        isPublished: true,
      },
      {
        indexLabel: "04 / 05",
        title: "ETALASE PRODUK & EKONOMI KREATIF",
        subtitle:
          "Panggung showcase karya dan rintisan usaha kader dari sektor teknologi, kuliner, kreatif, hingga ritel di tingkat kampus dan nasional.",
        imageSrc: "/assets/01-hero-home/hero-slide-04.jpg",
        imageAlt:
          "Showcase produk inovasi dan rintisan bisnis kreatif mahasiswa di aula pameran modern",
        sortOrder: 4,
        isPublished: true,
      },
      {
        indexLabel: "05 / 05",
        title: "EKSPANSI INDUSTRI & KEMITRAAN",
        subtitle:
          "Kunjungan perusahaan, dialog industri, dan kemitraan strategis untuk memperluas cakrawala bisnis kader Universitas Telkom.",
        imageSrc: "/assets/01-hero-home/hero-slide-05.jpg",
        imageAlt:
          "Delegasi mahasiswa HIPMI PT Universitas Telkom bertukar wawasan dalam kunjungan korporasi",
        sortOrder: 5,
        isPublished: true,
      },
    ]);
  }

  // 2. Tentang & 3 Pilar
  const existingTentang = await targetDb.query.tentangProfile.findFirst({
    where: eq(tentangProfile.id, 1),
  });
  if (!existingTentang) {
    await targetDb.insert(tentangProfile).values({
      id: 1,
      eyebrow: "01 / TENTANG KAMI",
      title: "Menggerakkan Ekosistem Wirausaha Mahasiswa Universitas Telkom",
      description:
        "UKM HIPMI PT Universitas Telkom merupakan unit kegiatan mahasiswa yang menjembatani semangat kewirausahaan kampus dengan jaringan pengusaha muda nasional melalui pembinaan usaha kader, program kerja terukur, dan kemitraan strategis.",
      secondaryDescription:
        "Melalui sinergi pembinaan bisnis mahasiswa, jejaring alumni HIPMI nasional, dan kolaborasi mitra industri, setiap kader ditempa untuk siap membangun usaha berdaya saing tinggi.",
      videoPosterSrc: "/assets/02-tentang-video/video-company-profile-poster.jpg",
      videoUrl: null,
    });
  }

  const existingPillars = await targetDb.query.tentangPillars.findMany();
  if (existingPillars.length === 0) {
    await targetDb.insert(tentangPillars).values([
      {
        title: "Inkubasi Bisnis Kader",
        description:
          "Pendampingan usaha mahasiswa mulai dari validasi pasar hingga penguatan operasional bisnis.",
        sortOrder: 1,
      },
      {
        title: "Jejaring Kemitraan",
        description:
          "Membuka akses kolaborasi lintas fakultas, alumni HIPMI, sponsor, dan mitra industri nasional.",
        sortOrder: 2,
      },
      {
        title: "Kepemimpinan Wirausaha",
        description:
          "Menempa karakter kader melalui manajemen proyek kewirausahaan dan forum diskusi strategis.",
        sortOrder: 3,
      },
    ]);
  }

  // 3. Partnerships
  const existingPartners = await targetDb.query.partners.findMany();
  if (existingPartners.length === 0) {
    await targetDb.insert(partners).values([
      {
        name: "Mitra Korporasi & BUMN",
        category: "Korporasi & BUMN",
        scope:
          "Slot lembaga mitra korporasi dan BUMN untuk program kunjungan industri, sponsorship, dan mentoring karier.",
        period: "Periode Kepengurusan 2026",
        status: "Slot Resmi Pengurus",
        imageSrc: "/assets/03-partnership/mitra-01-korporasi-bumn.jpg",
        imageAlt: "Emblem kategori mitra Korporasi dan BUMN HIPMI PT Telkom",
        sortOrder: 1,
        isPublished: true,
      },
      {
        name: "Jejaring BPC & BPD HIPMI",
        category: "Asosiasi & HIPMI",
        scope:
          "Sinergi perguruan tinggi dan pengurus cabang HIPMI daerah dalam forum pengusaha muda dan business matching.",
        period: "Periode Kepengurusan 2026",
        status: "Slot Resmi Pengurus",
        imageSrc: "/assets/03-partnership/mitra-02-bpc-bpd-hipmi.jpg",
        imageAlt: "Emblem kategori asosiasi BPC dan BPD HIPMI",
        sortOrder: 2,
        isPublished: true,
      },
      {
        name: "Dinas & Inkubator Kampus",
        category: "Dinas & Inkubator",
        scope:
          "Kolaborasi klinik legalitas usaha, perizinan NIB/UMKM, dan pembinaan inkubasi tenant mahasiswa.",
        period: "Periode Kepengurusan 2026",
        status: "Slot Resmi Pengurus",
        imageSrc: "/assets/03-partnership/mitra-03-dinas-inkubator.jpg",
        imageAlt: "Emblem kategori Dinas dan Inkubator Kewirausahaan",
        sortOrder: 3,
        isPublished: true,
      },
      {
        name: "Komunitas & Media Partner",
        category: "Komunitas & Media",
        scope:
          "Publikasi bersama kegiatan kewirausahaan, seminar nasional, dan liputan program kerja kampus.",
        period: "Periode Kepengurusan 2026",
        status: "Slot Resmi Pengurus",
        imageSrc: "/assets/03-partnership/mitra-04-komunitas-media.jpg",
        imageAlt: "Emblem kategori Komunitas dan Media Partner",
        sortOrder: 4,
        isPublished: true,
      },
      {
        name: "Mitra Strategis Ekosistem",
        category: "Mitra Strategis",
        scope:
          "Dukungan ekosistem kolaborasi lintas sektor untuk akselerasi usaha kader Universitas Telkom.",
        period: "Periode Kepengurusan 2026",
        status: "Slot Resmi Pengurus",
        imageSrc: "/assets/03-partnership/mitra-05-mitra-strategis-marquee.jpg",
        imageAlt: "Emblem kategori Mitra Strategis Ekosistem HIPMI PT Telkom",
        sortOrder: 5,
        isPublished: true,
      },
    ]);
  }

  // 4. Kader Businesses
  const existingBusinesses = await targetDb.query.kaderBusinesses.findMany();
  if (existingBusinesses.length === 0) {
    await targetDb.insert(kaderBusinesses).values([
      {
        businessName: "Usaha Kader 01 - Teknologi & Digital",
        sector: "Teknologi & Jasa",
        description:
          "Kategori rintisan produk digital, perangkat lunak, dan layanan berbasis teknologi oleh kader Universitas Telkom.",
        ownerLabel: "Pemilik: Kader Aktif Telkom",
        verifiedLabel: "Terverifikasi Pengurus 2026",
        imageSrc: "/assets/04-bisnis-kader/bisnis-01-teknologi.jpg",
        imageUrl: "/assets/04-bisnis-kader/bisnis-01-teknologi.jpg",
        imageAlt: "Ilustrasi usaha kader sektor teknologi dan digital",
        slotStatus: "ready",
        sortOrder: 1,
        isPublished: true,
      },
      {
        businessName: "Usaha Kader 02 - Kuliner & F&B",
        sector: "Kuliner / F&B",
        description:
          "Kategori usaha kuliner, kopi spesialti, dan produk pangan inovatif kader Universitas Telkom.",
        ownerLabel: "Pemilik: Kader Aktif Telkom",
        verifiedLabel: "Menunggu input data pengurus",
        imageSrc: null,
        imageUrl: null,
        imageAlt: "Slot visual usaha kader sektor kuliner",
        slotStatus: "pending-asset",
        sortOrder: 2,
        isPublished: true,
      },
      {
        businessName: "Usaha Kader 03 - Industri Kreatif",
        sector: "Kreatif & Media",
        description:
          "Kategori studio desain, agensi kreatif, produksi konten visual, dan layanan komunikasi merek milik kader mahasiswa Telkom University.",
        ownerLabel: "Pemilik: Kader Aktif Telkom",
        verifiedLabel: "Terverifikasi Pengurus 2026",
        imageSrc: "/assets/04-bisnis-kader/bisnis-03-kreatif.jpg",
        imageUrl: "/assets/04-bisnis-kader/bisnis-03-kreatif.jpg",
        imageAlt: "Ilustrasi usaha kader sektor industri kreatif dan desain",
        slotStatus: "ready",
        sortOrder: 3,
        isPublished: true,
      },
      {
        businessName: "Usaha Kader 04 - Fesyen & Ritel",
        sector: "Fesyen & Ritel",
        description:
          "Kategori brand fesyen, kriya, dan perdagangan ritel modern yang dikembangkan oleh anggota UKM HIPMI PT Universitas Telkom.",
        ownerLabel: "Pemilik: Kader Aktif Telkom",
        verifiedLabel: "Menunggu input data pengurus",
        imageSrc: null,
        imageUrl: null,
        imageAlt: "Slot visual usaha kader sektor fesyen dan ritel",
        slotStatus: "pending-asset",
        sortOrder: 4,
        isPublished: true,
      },
    ]);
  }

  // 5. Achievements
  const existingAchievements = await targetDb.query.achievements.findMany();
  if (existingAchievements.length === 0) {
    await targetDb.insert(achievements).values([
      {
        title: "Prestasi Kader 01 - Kompetisi Bisnis Nasional",
        category: "Kompetisi Bisnis",
        description:
          "Arsip keikutsertaan dan pencapaian kader pada lomba rencana bisnis dan business case tingkat regional maupun nasional.",
        recipientLabel: "Tim Bisnis Kader HIPMI PT Telkom",
        organizerLabel: "Kompetisi Kewirausahaan Nasional (2026)",
        imageSrc: null,
        imageUrl: null,
        imageAlt: "Slot dokumentasi kompetisi bisnis kader",
        slotStatus: "pending-asset",
        sortOrder: 1,
        isPublished: true,
      },
      {
        title: "Prestasi Kader 02 - Hibah Pendanaan Wirausaha",
        category: "Pendanaan & Hibah",
        description:
          "Catatan penerimaan hibah pembinaan kewirausahaan mahasiswa seperti P2MW, inkubasi startup, dan program akselerasi usaha kampus.",
        recipientLabel: "Tenant Inkubasi HIPMI PT Telkom",
        organizerLabel: "Kemendikbudristek RI P2MW (2026)",
        imageSrc: null,
        imageUrl: null,
        imageAlt: "Slot dokumentasi hibah dan pendanaan usaha kader",
        slotStatus: "pending-asset",
        sortOrder: 2,
        isPublished: true,
      },
      {
        title: "Prestasi Kader 03 - Delegasi Forum Nasional",
        category: "Tingkat Nasional",
        description:
          "Dokumentasi keterwakilan kader UKM HIPMI PT Universitas Telkom pada forum pengusaha muda dan ekshibisi nasional.",
        recipientLabel: "Delegasi Resmi HIPMI PT Telkom",
        organizerLabel: "HIPMI PT Indonesia (2026)",
        imageSrc: null,
        imageUrl: null,
        imageAlt: "Slot dokumentasi capaian tingkat nasional",
        slotStatus: "pending-asset",
        sortOrder: 3,
        isPublished: true,
      },
      {
        title: "Prestasi Kader 04 - Rekognisi Inovasi Usaha",
        category: "Rekognisi",
        description:
          "Penghargaan kelembagaan dan apresiasi eksternal atas inovasi produk, dampak sosial, serta kontribusi kader wirausaha muda.",
        recipientLabel: "Kader Penggerak Wirausaha Telkom",
        organizerLabel: "Telkom University Award (2026)",
        imageSrc: "/assets/05-prestasi/prestasi-04-rekognisi.jpg",
        imageUrl: "/assets/05-prestasi/prestasi-04-rekognisi.jpg",
        imageAlt:
          "Seremoni penyerahan apresiasi dan penghargaan prestasi kewirausahaan kader",
        slotStatus: "ready",
        sortOrder: 4,
        isPublished: true,
      },
    ]);
  }

  // 6. Program Kerja & Kompartemen (3-Tier)
  const existingBidangs = await targetDb.query.workProgramBidangs.findMany();
  if (existingBidangs.length === 0) {
    const bidangSeed = [
      {
        slug: "okk" as const,
        shortName: "OKK",
        title: "BIDANG OKK",
        eyebrow: "PROGRAM KERJA BIDANG OKK",
        description:
          "Bidang Organisasi, Kaderisasi, dan Keanggotaan yang berfokus pada pengembangan kapasitas individu, sistem keorganisasian, serta kesejahteraan kader.",
        compartmentSummary: "PSDM, ADKESKA",
        sortOrder: 1,
        compartments: [
          {
            code: "KOMPARTEMEN 1: PSDM",
            name: "Kompartemen PSDM",
            operationalPattern: "proker-only" as const,
            sortOrder: 1,
            slides: [
              {
                kind: "proker" as const,
                title: "OPEN MIND, YEC & LDKK",
                description:
                  "Peningkatan kapasitas individu kader melalui pelatihan, pengembangan soft skill, dan pembentukan karakter guna menciptakan jiwa kewirausahaan.",
                imageSrc: "/assets/06-program-kerja/okk/psdm-proker-01b-yec.jpg",
                imageAlt:
                  "Poster resmi Program Kerja Young Entrepreneur Camp (YEC) HIPMI PT Telkom",
                mediaSourceLabel: "Poster IG @yechipmitelkom",
                slotStatus: "ready" as const,
                sortOrder: 1,
              },
              {
                kind: "proker" as const,
                title: "DIES NATALIS & STAFF MUDA PENGUSAHA",
                description:
                  "Momentum perayaan hari lahir organisasi sekaligus wadah pengenalan dan pelantikan staff muda ke dalam ekosistem kaderisasi HIPMI PT Telkom.",
                imageSrc: null,
                imageAlt: "Slot poster Dies Natalis dan Staff Muda Pengusaha",
                mediaSourceLabel: "06-program-kerja/okk/psdm-proker-02.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 2,
              },
            ],
          },
          {
            code: "KOMPARTEMEN 2: ADKESKA",
            name: "Kompartemen ADKESKA",
            operationalPattern: "proker-jobdesk" as const,
            sortOrder: 2,
            slides: [
              {
                kind: "proker" as const,
                title: "SEKOLAH PENGUSAHA",
                description:
                  "Peningkatan pengetahuan dan mentalitas wirausaha kader melalui seminar interaktif, bedah kasus bisnis, dan pembinaan terstruktur.",
                imageSrc:
                  "/assets/06-program-kerja/okk/adkeska-proker-01-sekolah-pengusaha.jpg",
                imageAlt:
                  "Poster resmi Program Kerja Sekolah Pengusaha HIPMI PT Universitas Telkom",
                mediaSourceLabel: "Poster IG @sekolahpengusaha_hipmitelu",
                slotStatus: "ready" as const,
                sortOrder: 1,
              },
              {
                kind: "jobdesk" as const,
                title: "ADKESCARE",
                description:
                  "Jobdesk layanan kesejahteraan, penghimpunan aspirasi, dan advokasi anggota untuk memastikan kenyamanan serta keberlanjutan keaktifan kader.",
                imageSrc: null,
                imageAlt: "Slot dokumentasi jobdesk AdkesCare",
                mediaSourceLabel: "06-program-kerja/okk/adkeska-jobdesk-01.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 2,
              },
              {
                kind: "jobdesk" as const,
                title: "INVEST PRENEUR",
                description:
                  "Jobdesk edukasi literasi finansial, pencatatan keuangan dasar, dan kesiapan investasi modal bagi usaha rintisan kader.",
                imageSrc: null,
                imageAlt: "Slot dokumentasi jobdesk Invest Preneur",
                mediaSourceLabel: "06-program-kerja/okk/adkeska-jobdesk-02.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 3,
              },
            ],
          },
        ],
      },
      {
        slug: "medkominfo" as const,
        shortName: "Medkominfo",
        title: "BIDANG MEDKOMINFO",
        eyebrow: "PROGRAM KERJA BIDANG MEDKOMINFO",
        description:
          "Bidang Media Komunikasi dan Informasi yang mengelola strategi komunikasi visual, publikasi digital, serta branding organisasi HIPMI PT Telkom.",
        compartmentSummary: "Media Komunikasi, Media Kreatif",
        sortOrder: 2,
        compartments: [
          {
            code: "KOMPARTEMEN 1: MEDIA KOMUNIKASI",
            name: "Kompartemen Media Komunikasi",
            operationalPattern: "jobdesk-only" as const,
            sortOrder: 1,
            slides: [
              {
                kind: "jobdesk" as const,
                title: "HIPMI TALKS & NEXTPRENEUR TALKS",
                description:
                  "Wadah diskusi inspiratif dalam bentuk talkshow dan forum interaktif bersama narasumber bisnis serta praktisi industri.",
                imageSrc: null,
                imageAlt: "Slot visual HIPMI Talks dan NextPreneur Talks",
                mediaSourceLabel: "06-program-kerja/medkominfo/hipmi-talks.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 1,
              },
            ],
          },
          {
            code: "KOMPARTEMEN 2: MEDIA KREATIF",
            name: "Kompartemen Media Kreatif",
            operationalPattern: "jobdesk-only" as const,
            sortOrder: 2,
            slides: [
              {
                kind: "jobdesk" as const,
                title: "HIPMI DIGITAL HUB",
                description:
                  "Pengelolaan pusat informasi digital, desain konten kreatif, dan publikasi terpadu HIPMI PT Universitas Telkom.",
                imageSrc: null,
                imageAlt: "Slot visual HIPMI Digital HUB",
                mediaSourceLabel: "06-program-kerja/medkominfo/digital-hub.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 1,
              },
              {
                kind: "jobdesk" as const,
                title: "DIGITAL ENTREPRENEUR",
                description:
                  "Kampanye visual, showcase produk digital, dan produksi materi konten penggerak minat wirausaha di kanal resmi UKM.",
                imageSrc: null,
                imageAlt: "Slot visual Digital Entrepreneur",
                mediaSourceLabel: "06-program-kerja/medkominfo/digital-ent.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 2,
              },
            ],
          },
        ],
      },
      {
        slug: "eksternal" as const,
        shortName: "Eksternal",
        title: "BIDANG EKSTERNAL",
        eyebrow: "PROGRAM KERJA BIDANG EKSTERNAL",
        description:
          "Bidang Eksternal yang membangun relasi nasional, kemitraan industri strategis, serta kontribusi pengabdian masyarakat HIPMI PT Telkom.",
        compartmentSummary: "Relation, Partnership, Pengmas",
        sortOrder: 3,
        compartments: [
          {
            code: "KOMPARTEMEN 1: RELASI (RELATION)",
            name: "Kompartemen Relasi",
            operationalPattern: "proker-jobdesk" as const,
            sortOrder: 1,
            slides: [
              {
                kind: "proker" as const,
                title: "BUSINESS SHOW",
                description:
                  "Pameran dan ajang promosi bisnis kader HIPMI PT Universitas Telkom di tingkat eksternal untuk membuka peluang pasar dan investor.",
                imageSrc: null,
                imageAlt: "Slot visual Program Kerja Business Show",
                mediaSourceLabel: "06-program-kerja/eksternal/business-show.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 1,
              },
              {
                kind: "jobdesk" as const,
                title: "HIPMI GOES NASIONAL",
                description:
                  "Penjalinan relasi kelembagaan lintas kampus dan keterwakilan organisasi pada jejaring HIPMI perguruan tinggi tingkat nasional.",
                imageSrc: null,
                imageAlt: "Slot visual jobdesk HIPMI Goes Nasional",
                mediaSourceLabel: "06-program-kerja/eksternal/goes-nasional.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 2,
              },
            ],
          },
          {
            code: "KOMPARTEMEN 2: PARTNERSHIP",
            name: "Kompartemen Partnership",
            operationalPattern: "proker-jobdesk" as const,
            sortOrder: 2,
            slides: [
              {
                kind: "proker" as const,
                title: "COMPANY VISIT",
                description:
                  "Kunjungan langsung ke perusahaan inspiratif untuk memperluas jejaring serta wawasan operasional bisnis kader.",
                imageSrc:
                  "/assets/06-program-kerja/eksternal/partnership-proker-01-company-visit.jpg",
                imageAlt:
                  "Poster resmi Program Kerja Company Visit HIPMI PT Universitas Telkom",
                mediaSourceLabel: "Poster IG @comvis.hipmitelu",
                slotStatus: "ready" as const,
                sortOrder: 1,
              },
              {
                kind: "jobdesk" as const,
                title: "EXPLORE BUSINESS",
                description:
                  "Penjajakan mitra bisnis baru, sponsorship program kerja, dan pemetaan peluang kolaborasi antara UKM dan dunia usaha.",
                imageSrc: null,
                imageAlt: "Slot visual jobdesk Explore Business",
                mediaSourceLabel: "06-program-kerja/eksternal/explore-biz.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 2,
              },
            ],
          },
          {
            code: "KOMPARTEMEN 3: PENGMAS",
            name: "Kompartemen Pengmas",
            operationalPattern: "proker-jobdesk" as const,
            sortOrder: 3,
            slides: [
              {
                kind: "proker" as const,
                title: "HIPMI VILLAGE",
                description:
                  "Pengembangan potensi desa dan UMKM lokal melalui edukasi manajemen usaha serta pemberdayaan masyarakat berkelanjutan.",
                imageSrc:
                  "/assets/06-program-kerja/eksternal/pengmas-proker-01-hipmi-village.jpg",
                imageAlt:
                  "Poster resmi Program Kerja HIPMI Goes to Village HIPMI PT Universitas Telkom",
                mediaSourceLabel: "Poster IG @hipmivillage",
                slotStatus: "ready" as const,
                sortOrder: 1,
              },
              {
                kind: "jobdesk" as const,
                title: "HIPMI SOSIAL",
                description:
                  "Aksi tanggap sosial, santunan komunitas, dan kolaborasi kemanusiaan yang melibatkan kader pengusaha mahasiswa.",
                imageSrc: null,
                imageAlt: "Slot visual jobdesk HIPMI Sosial",
                mediaSourceLabel: "06-program-kerja/eksternal/hipmi-sosial.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 2,
              },
            ],
          },
        ],
      },
      {
        slug: "ekraf" as const,
        shortName: "Ekraf",
        title: "BIDANG EKRAF",
        eyebrow: "PROGRAM KERJA BIDANG EKRAF",
        description:
          "Bidang Ekonomi Kreatif yang membina unit bisnis organisasi, keikutsertaan kompetisi nasional, dan akselerasi usaha kader HIPMI PT Telkom.",
        compartmentSummary: "Kompetisi, BUMH, Pengembangan Bisnis",
        sortOrder: 4,
        compartments: [
          {
            code: "KOMPARTEMEN 1: KOMPETISI",
            name: "Kompartemen Kompetisi",
            operationalPattern: "proker-jobdesk" as const,
            sortOrder: 1,
            slides: [
              {
                kind: "proker" as const,
                title: "HIPMI NASIONAL COMPETITION",
                description:
                  "Fasilitator kompetisi kewirausahaan bagi seluruh anggota HIPMI PT Universitas Telkom serta mahasiswa Indonesia.",
                imageSrc: null,
                imageAlt: "Slot visual HIPMI Nasional Competition",
                mediaSourceLabel: "06-program-kerja/ekraf/hnc.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 1,
              },
              {
                kind: "jobdesk" as const,
                title: "HIPMI CHAMPION",
                description:
                  "Pendampingan penyiapan delegasi lomba bisnis kader, pemetaan jadwal kompetisi nasional, dan coaching deck presentasi.",
                imageSrc: null,
                imageAlt: "Slot visual jobdesk HIPMI Champion",
                mediaSourceLabel: "06-program-kerja/ekraf/champion.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 2,
              },
            ],
          },
          {
            code: "KOMPARTEMEN 2: BUMH",
            name: "Kompartemen BUMH",
            operationalPattern: "jobdesk-only" as const,
            sortOrder: 2,
            slides: [
              {
                kind: "jobdesk" as const,
                title: "HIVE PROJECT",
                description:
                  "Inkubator usaha internal untuk mewujudkan kemandirian ekonomi organisasi HIPMI PT Universitas Telkom.",
                imageSrc: null,
                imageAlt: "Slot visual jobdesk Hive Project BUMH",
                mediaSourceLabel: "06-program-kerja/ekraf/hive-project.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 1,
              },
            ],
          },
          {
            code: "KOMPARTEMEN 3: PENGBIS",
            name: "Kompartemen Pengbis",
            operationalPattern: "proker-only" as const,
            sortOrder: 3,
            slides: [
              {
                kind: "proker" as const,
                title: "BUSINESS CLASS",
                description:
                  "Program mentoring dan pendampingan kapasitas bisnis mahasiswa bersama praktisi serta mentor wirausaha.",
                imageSrc:
                  "/assets/06-program-kerja/ekraf/pengbis-proker-01-business-class.jpg",
                imageAlt:
                  "Poster resmi Program Kerja Business Class HIPMI PT Universitas Telkom",
                mediaSourceLabel: "Poster IG @businessclass_hipmi",
                slotStatus: "ready" as const,
                sortOrder: 1,
              },
              {
                kind: "proker" as const,
                title: "KAJIAN STRATEGIS",
                description:
                  "Forum diskusi tren ekonomi, riset sektor usaha potensial, dan penyusunan analisis strategi pengembangan bisnis kader.",
                imageSrc: null,
                imageAlt: "Slot visual Kajian Strategis Pengembangan Bisnis",
                mediaSourceLabel: "06-program-kerja/ekraf/kajian-strategis.jpg",
                slotStatus: "pending-asset" as const,
                sortOrder: 2,
              },
            ],
          },
        ],
      },
    ];

    for (const b of bidangSeed) {
      const { compartments, ...bidangData } = b;
      const [insertedBidang] = await targetDb
        .insert(workProgramBidangs)
        .values(bidangData)
        .returning();

      for (const comp of compartments) {
        const { slides, ...compData } = comp;
        const [insertedComp] = await targetDb
          .insert(compartmentStages)
          .values({
            ...compData,
            bidangId: insertedBidang.id,
          })
          .returning();

        if (slides.length > 0) {
          await targetDb.insert(programSlides).values(
            slides.map((s) => ({
              ...s,
              compartmentId: insertedComp.id,
            }))
          );
        }
      }
    }
  }

  // 7. Testimonials (include 2 verified defaults so Web Profile isn't empty, plus 1 pending moderation)
  const existingTestimonials = await targetDb.query.testimonials.findMany();
  if (existingTestimonials.length === 0) {
    await targetDb.insert(testimonials).values([
      {
        category: "Kader & Alumni",
        quote:
          "Melalui inkubasi bisnis dan jejaring mentor HIPMI PT Universitas Telkom, usaha rintisan kami berhasil memvalidasi pasar dan bertumbuh sejak bangku kuliah.",
        authorLabel: "Raka Pratama Putra",
        roleOrOrg: "Kader Pengusaha & Alumni Telkom",
        verified: true,
        sortOrder: 1,
        isPublished: true,
      },
      {
        category: "Mitra Kolaborasi",
        quote:
          "Kolaborasi program kerja bersama pengurus HIPMI PT Universitas Telkom selalu terstruktur, adaptif, dan memberi dampak nyata bagi ekosistem wirausaha muda.",
        authorLabel: "Perwakilan Mitra Industri",
        roleOrOrg: "Mitra Strategis Ekosistem Bandung",
        verified: true,
        sortOrder: 2,
        isPublished: true,
      },
      {
        category: "Kader & Alumni",
        quote:
          "Forum diskusi bisnis dan Sekolah Pengusaha membantu kami menyusun proyeksi keuangan usaha secara rapi sebelum mengikuti kompetisi hibah nasional.",
        authorLabel: "Devina Putri Lestari",
        roleOrOrg: "Kader Aktif FEB Universitas Telkom",
        verified: false,
        sortOrder: 3,
        isPublished: true,
      },
    ]);
  }

  // 8. Site Settings & Announcements
  const existingSettings = await targetDb.query.siteSettings.findFirst({
    where: eq(siteSettings.id, 1),
  });
  if (!existingSettings) {
    await targetDb.insert(siteSettings).values({
      id: 1,
      googleDocsTemplateUrl: "https://drive.google.com/drive/folders/hipmi-surat",
      scoreWeightMeeting: 5,
      scoreWeightProker: 10,
      ctaCollaborationHref: "#kontak-kolaborasi",
      ctaBusinessHref: "#kontak-kolaborasi",
      ctaAchievementHref: "#kontak-kolaborasi",
      secretariatAddress:
        "Student Center Universitas Telkom, Jl. Telekomunikasi No. 1, Terusan Buahbatu, Kabupaten Bandung, Jawa Barat 40257",
      officialEmail: "sekretariat@hipmipt-telkom.org",
      officialInstagram: "@hipmipt.telkom",
      whatsappContactLabel: "Humas & Kemitraan Pengurus",
      whatsappContactUrl: "https://wa.me/6281234567890",
      copyrightText: "© 2026 UKM HIPMI PT UNIVERSITAS TELKOM. Seluruh hak cipta dilindungi.",
    });
  }

  const existingAnnouncements = await targetDb.query.announcements.findMany();
  if (existingAnnouncements.length === 0) {
    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + 3);
    await targetDb.insert(announcements).values([
      {
        title: "Ekosistem Wirausaha Mahasiswa Universitas Telkom 2026",
        content:
          "Portal Resmi UKM HIPMI PT Universitas Telkom terhubung langsung dengan CMS Pengurus.",
        targetAudience: "BOTH",
        startDate: start,
        endDate: end,
        isActive: true,
      },
    ]);
  }

  console.log("CMS data seeded successfully.");
}

if (process.argv[1]?.endsWith("cms.seed.ts")) {
  seedCmsData()
    .then(() => closeDbConnection())
    .catch((err) => {
      console.error("CMS seeding error:", err);
      process.exit(1);
    });
}
