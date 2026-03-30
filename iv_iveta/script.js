document.addEventListener("DOMContentLoaded", () => {

    // ── Config ────────────────────────────────────────────────
    const API = "./API";
    const PER_PAGE = 10;

    // ── State ─────────────────────────────────────────────────
    let allEmployees  = [];   // current full result set
    let currentPage   = 1;
    let sortField     = null; // 'name' | 'address'
    let sortDir       = 'asc';
    let pendingDelete = null; // employee_id waiting for confirm

    // ── DOM refs ──────────────────────────────────────────────
    const filterName    = document.getElementById("filterName");
    const filterJob     = document.getElementById("filterJob");
    const filterDept    = document.getElementById("filterDept");
    const filterSalary  = document.getElementById("filterSalary");
    const salaryLabel   = document.getElementById("salaryLabel");
    const filterAddress = document.getElementById("filterAddress");
    const filterTown    = document.getElementById("filterTown");
    const resultsCount  = document.getElementById("resultsCount");
    const tableBody     = document.getElementById("tableBody");
    const pagination    = document.getElementById("pagination");

    const btnAdd    = document.getElementById("btnAdd");
    const btnSearch = document.getElementById("btnSearch");
    const btnClear  = document.getElementById("btnClear");
    const btnExcel  = document.getElementById("btnExcel");

    const addModal    = document.getElementById("addModal");
    const editModal   = document.getElementById("editModal");
    const deleteModal = document.getElementById("deleteModal");
    const deleteEmpName   = document.getElementById("deleteEmpName");
    const btnConfirmDelete = document.getElementById("btnConfirmDelete");

    const addForm   = document.getElementById("addForm");
    const editForm  = document.getElementById("editForm");
    const addError  = document.getElementById("addError");
    const editError = document.getElementById("editError");

    const addDeptSelect  = document.getElementById("addDeptSelect");
    const editDeptSelect = document.getElementById("editDeptSelect");
    const addTownSelect  = document.getElementById("addTownSelect");
    const editTownSelect = document.getElementById("editTownSelect");

    const thName = document.querySelector("th[data-col='name']");
    const thAddr = document.querySelector("th[data-col='address']");
    const toast  = document.getElementById("toast");

    // ── Init ──────────────────────────────────────────────────
    async function init() {
        await Promise.all([loadDepartments(), loadTowns()]);
        await searchEmployees();
    }

    // ── Salary slider label ───────────────────────────────────
    filterSalary.addEventListener("input", () => {
        const val = parseInt(filterSalary.value);
        salaryLabel.textContent = val >= 100000
            ? "100,000+"
            : "$" + val.toLocaleString();

        // Update slider gradient fill
        const pct = (val / 100000) * 100;
        filterSalary.style.background =
            `linear-gradient(to right, var(--primary) ${pct}%, var(--gray-200) ${pct}%)`;
    });

    // ── Load departments into dropdowns ───────────────────────
    async function loadDepartments() {
        try {
            const res  = await fetch(`${API}/departments.php`);
            const data = await res.json();
            const options = data.map(d =>
                `<option value="${d.department_id}">${d.name}</option>`
            ).join("");
            filterDept.innerHTML    = '<option value="">All Departments</option>' + options;
            addDeptSelect.innerHTML  = '<option value="">Select department…</option>' + options;
            editDeptSelect.innerHTML = '<option value="">Select department…</option>' + options;
        } catch (e) { console.error("Failed to load departments", e); }
    }

    // ── Load towns into dropdowns ─────────────────────────────
    async function loadTowns() {
        try {
            const res  = await fetch(`${API}/towns.php`);
            const data = await res.json();
            const options = data.map(t =>
                `<option value="${t.town_id}">${t.name}</option>`
            ).join("");
            filterTown.innerHTML    = '<option value="">All Towns</option>' + options;
            addTownSelect.innerHTML  = '<option value="">Select town…</option>' + options;
            editTownSelect.innerHTML = '<option value="">Select town…</option>' + options;
        } catch (e) { console.error("Failed to load towns", e); }
    }

    // ── Search / fetch employees ──────────────────────────────
    async function searchEmployees() {
        const params = new URLSearchParams();
        if (filterName.value.trim())    params.set("name",          filterName.value.trim());
        if (filterJob.value.trim())     params.set("job",           filterJob.value.trim());
        if (filterDept.value)           params.set("department_id", filterDept.value);
        if (parseInt(filterSalary.value) < 100000)
                                        params.set("salary_max",    filterSalary.value);
        if (filterAddress.value.trim()) params.set("address",       filterAddress.value.trim());
        if (filterTown.value)           params.set("town_id",       filterTown.value);

        try {
            const res  = await fetch(`${API}/employees.php?${params}`);
            const data = await res.json();
            allEmployees  = data;
            currentPage   = 1;
            applySort();
            renderTable();
            renderPagination();
        } catch (e) {
            showToast("Failed to load employees", "error");
            console.error(e);
        }
    }

    // ── Sort helpers ──────────────────────────────────────────
    function applySort() {
        if (!sortField) return;
        allEmployees.sort((a, b) => {
            const va = sortField === 'name'
                ? (a.full_name || '').toLowerCase()
                : (a.address_text || '').toLowerCase();
            const vb = sortField === 'name'
                ? (b.full_name || '').toLowerCase()
                : (b.address_text || '').toLowerCase();
            if (va < vb) return sortDir === 'asc' ? -1 :  1;
            if (va > vb) return sortDir === 'asc' ?  1 : -1;
            return 0;
        });
    }

    function updateSortIcons() {
        [thName, thAddr].forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            th.querySelector('.sort-icon i').className = 'fa-solid fa-sort';
        });
        if (!sortField) return;
        const th = sortField === 'name' ? thName : thAddr;
        th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        th.querySelector('.sort-icon i').className =
            sortDir === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
    }

    thName.addEventListener("click", () => toggleSort('name'));
    thAddr.addEventListener("click", () => toggleSort('address'));

    function toggleSort(field) {
        if (sortField === field) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = field;
            sortDir   = 'asc';
        }
        applySort();
        updateSortIcons();
        currentPage = 1;
        renderTable();
        renderPagination();
    }

    // ── Render table ──────────────────────────────────────────
    function renderTable() {
        resultsCount.textContent = allEmployees.length;
        if (allEmployees.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="no-data">No employees found</td></tr>';
            return;
        }
        const start = (currentPage - 1) * PER_PAGE;
        const page  = allEmployees.slice(start, start + PER_PAGE);

        tableBody.innerHTML = page.map((emp, idx) => {
            const rowNum  = start + idx + 1;
            const salary  = emp.salary
                ? "$" + parseFloat(emp.salary).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                : "—";
            return `
            <tr data-id="${emp.employee_id}">
                <td class="col-num">${rowNum}</td>
                <td>${escHtml(emp.full_name || '')}</td>
                <td>${escHtml(emp.job_title || '')}</td>
                <td>${escHtml(emp.department_name || '')}</td>
                <td class="col-salary">${salary}</td>
                <td>${escHtml(emp.address_text || '—')}</td>
                <td>${escHtml(emp.town_name || '—')}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-sm btn-sm-edit"   data-action="edit"   data-id="${emp.employee_id}">
                            <i class="fa-solid fa-pen"></i> Edit
                        </button>
                        <button class="btn-sm btn-sm-delete" data-action="delete" data-id="${emp.employee_id}">
                            <i class="fa-solid fa-trash"></i> Del
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join("");
    }

    // ── Render pagination ─────────────────────────────────────
    function renderPagination() {
        const total = Math.ceil(allEmployees.length / PER_PAGE);
        if (total <= 1) { pagination.innerHTML = ""; return; }

        let html = `<button class="page-btn" id="prevBtn" ${currentPage === 1 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>`;

        // Show max 7 page buttons with ellipsis
        const pages = buildPageRange(currentPage, total);
        pages.forEach(p => {
            if (p === '…') {
                html += `<span style="padding:0 4px;color:var(--gray-400);">…</span>`;
            } else {
                html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
            }
        });

        html += `<button class="page-btn" id="nextBtn" ${currentPage === total ? 'disabled' : ''}>
                     <i class="fa-solid fa-chevron-right"></i>
                 </button>`;
        pagination.innerHTML = html;

        document.getElementById("prevBtn")?.addEventListener("click", () => { currentPage--; renderTable(); renderPagination(); });
        document.getElementById("nextBtn")?.addEventListener("click", () => { currentPage++; renderTable(); renderPagination(); });
        pagination.querySelectorAll(".page-btn[data-page]").forEach(btn => {
            btn.addEventListener("click", () => {
                currentPage = parseInt(btn.dataset.page);
                renderTable();
                renderPagination();
            });
        });
    }

    function buildPageRange(current, total) {
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
        if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
        if (current >= total - 3) return [1, '…', total-4, total-3, total-2, total-1, total];
        return [1, '…', current-1, current, current+1, '…', total];
    }

    // ── Table action delegation ───────────────────────────────
    tableBody.addEventListener("click", e => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const id  = parseInt(btn.dataset.id);
        const emp = allEmployees.find(x => x.employee_id === id);
        if (!emp) return;

        if (btn.dataset.action === "edit")   openEditModal(emp);
        if (btn.dataset.action === "delete") openDeleteModal(emp);
    });

    // ── Button listeners ──────────────────────────────────────
    btnSearch.addEventListener("click", () => { currentPage = 1; searchEmployees(); });
    btnAdd.addEventListener("click", openAddModal);
    btnClear.addEventListener("click", () => {
        filterName.value    = "";
        filterJob.value     = "";
        filterDept.value    = "";
        filterSalary.value  = 100000;
        salaryLabel.textContent = "100,000+";
        filterSalary.style.background = "linear-gradient(to right, var(--primary) 100%, var(--gray-200) 100%)";
        filterAddress.value = "";
        filterTown.value    = "";
        sortField = null;
        sortDir   = 'asc';
        updateSortIcons();
        searchEmployees();
    });
    btnExcel.addEventListener("click", exportToExcel);

    // Enter key triggers search from any filter input
    [filterName, filterJob, filterAddress].forEach(input => {
        input.addEventListener("keydown", e => { if (e.key === "Enter") searchEmployees(); });
    });

    // ── Modal helpers ─────────────────────────────────────────
    function openModal(modal) { modal.classList.add("open"); }
    function closeModal(modal) { modal.classList.remove("open"); }

    document.querySelectorAll(".modal-close, [data-modal]").forEach(el => {
        el.addEventListener("click", () => {
            const id = el.dataset.modal;
            if (id) closeModal(document.getElementById(id));
        });
    });

    // Close on overlay click
    [addModal, editModal, deleteModal].forEach(m => {
        m.addEventListener("click", e => { if (e.target === m) closeModal(m); });
    });

    // ── Add modal ─────────────────────────────────────────────
    function openAddModal() {
        addForm.reset();
        addError.textContent = "";
        openModal(addModal);
    }

    addForm.addEventListener("submit", async e => {
        e.preventDefault();
        addError.textContent = "";
        const fd = new FormData(addForm);
        const body = {
            first_name:    fd.get("first_name").trim(),
            last_name:     fd.get("last_name").trim(),
            middle_name:   fd.get("middle_name").trim(),
            job_title:     fd.get("job_title").trim(),
            department_id: parseInt(fd.get("department_id")),
            salary:        parseFloat(fd.get("salary")),
            address_text:  fd.get("address_text").trim(),
            town_id:       parseInt(fd.get("town_id")),
        };
        if (!body.first_name || !body.last_name || !body.job_title || !body.department_id || !body.address_text || !body.town_id) {
            addError.textContent = "Please fill in all required fields.";
            return;
        }
        try {
            const res  = await fetch(`${API}/employees.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            allEmployees.push(data);
            applySort();
            renderTable();
            renderPagination();
            closeModal(addModal);
            showToast("Employee added successfully!", "success");
        } catch (err) {
            addError.textContent = "Error: " + err.message;
        }
    });

    // ── Edit modal ────────────────────────────────────────────
    function openEditModal(emp) {
        editForm.reset();
        editError.textContent = "";
        const f = editForm.elements;
        f["employee_id"].value  = emp.employee_id;
        f["address_id"].value   = emp.address_id || "";
        f["first_name"].value   = emp.first_name  || "";
        f["last_name"].value    = emp.last_name   || "";
        f["middle_name"].value  = emp.middle_name || "";
        f["job_title"].value    = emp.job_title   || "";
        f["department_id"].value = emp.department_id || "";
        f["salary"].value       = emp.salary || "";
        f["address_text"].value = emp.address_text || "";
        f["town_id"].value      = emp.town_id || "";
        openModal(editModal);
    }

    editForm.addEventListener("submit", async e => {
        e.preventDefault();
        editError.textContent = "";
        const fd = new FormData(editForm);
        const id = parseInt(fd.get("employee_id"));
        const body = {
            first_name:    fd.get("first_name").trim(),
            last_name:     fd.get("last_name").trim(),
            middle_name:   fd.get("middle_name").trim(),
            job_title:     fd.get("job_title").trim(),
            department_id: parseInt(fd.get("department_id")),
            salary:        parseFloat(fd.get("salary")),
            address_text:  fd.get("address_text").trim(),
            town_id:       parseInt(fd.get("town_id")),
            address_id:    parseInt(fd.get("address_id")) || 0,
        };
        try {
            const res  = await fetch(`${API}/employees.php?id=${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            // Update in local array
            const idx = allEmployees.findIndex(x => x.employee_id === id);
            if (idx !== -1) allEmployees[idx] = data;
            applySort();
            renderTable();
            renderPagination();
            closeModal(editModal);
            showToast("Employee updated successfully!", "success");
        } catch (err) {
            editError.textContent = "Error: " + err.message;
        }
    });

    // ── Delete modal ──────────────────────────────────────────
    function openDeleteModal(emp) {
        pendingDelete = emp.employee_id;
        deleteEmpName.textContent = emp.full_name;
        openModal(deleteModal);
    }

    btnConfirmDelete.addEventListener("click", async () => {
        if (!pendingDelete) return;
        const id = pendingDelete;
        try {
            const res  = await fetch(`${API}/employees.php?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            allEmployees = allEmployees.filter(x => x.employee_id !== id);
            // Adjust page if needed
            const totalPages = Math.ceil(allEmployees.length / PER_PAGE);
            if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
            renderTable();
            renderPagination();
            closeModal(deleteModal);
            showToast("Employee deleted.", "success");
        } catch (err) {
            showToast("Delete failed: " + err.message, "error");
        }
        pendingDelete = null;
    });

    // ── Excel export ──────────────────────────────────────────
    function exportToExcel() {
        if (!allEmployees.length) { showToast("No data to export.", "error"); return; }
        const headers = ["N°", "Full Name", "Job Title", "Department", "Salary", "Address", "Town"];
        const rows = allEmployees.map((emp, i) => [
            i + 1,
            emp.full_name    || "",
            emp.job_title    || "",
            emp.department_name || "",
            parseFloat(emp.salary) || 0,
            emp.address_text || "",
            emp.town_name    || "",
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        // Column widths
        ws["!cols"] = [
            { wch: 5 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 26 }, { wch: 16 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Employees");
        XLSX.writeFile(wb, "employees.xlsx");
        showToast("Excel file downloaded!", "success");
    }

    // ── Toast ─────────────────────────────────────────────────
    let toastTimer = null;
    function showToast(msg, type = "success") {
        toast.textContent = msg;
        toast.className   = `toast ${type} show`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
    }

    // ── Utility ───────────────────────────────────────────────
    function escHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ── Kick off ──────────────────────────────────────────────
    init();
});
