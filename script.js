(function () {
  "use strict";

  /** 腾讯问卷地址（q1–q6 对应各字段预填） */
  const TENCENT_FORM_URL = "https://wj.qq.com/s2/26738624/0185/";

  /**
   * 教师视角统一数据对象，便于后续扩展（导出、统计看板等）
   * @type {{ studentName: string, className: string, accuracy: string, wrongQuestions: string, weakKnowledge: string, aiComment: string }}
   */
  const teacherData = {
    studentName: "",
    className: "",
    accuracy: "",
    wrongQuestions: "",
    weakKnowledge: "",
    aiComment: "",
  };

  /** 本次闯关结算快照（不含姓名班级） */
  let sessionSnapshot = null;

  const els = {
    screenLoading: document.getElementById("screenLoading"),
    screenQuiz: document.getElementById("screenQuiz"),
    screenResult: document.getElementById("screenResult"),
    loadError: document.getElementById("loadError"),
    headerMeta: document.getElementById("headerMeta"),
    progressText: document.getElementById("progressText"),
    progressFill: document.getElementById("progressFill"),
    knowledgeTag: document.getElementById("knowledgeTag"),
    questionIndex: document.getElementById("questionIndex"),
    questionText: document.getElementById("questionText"),
    optionsList: document.getElementById("optionsList"),
    feedbackZone: document.getElementById("feedbackZone"),
    feedbackStatus: document.getElementById("feedbackStatus"),
    feedbackTitle: document.getElementById("feedbackTitle"),
    aiFeedback: document.getElementById("aiFeedback"),
    wrongOptionLabel: document.getElementById("wrongOptionLabel"),
    feedbackCards: document.getElementById("feedbackCards"),
    btnSubmit: document.getElementById("btnSubmit"),
    statAccuracy: document.getElementById("statAccuracy"),
    statFirstCorrect: document.getElementById("statFirstCorrect"),
    statTotal: document.getElementById("statTotal"),
    statErrors: document.getElementById("statErrors"),
    statRing: document.getElementById("statRing"),
    weakKnowledge: document.getElementById("weakKnowledge"),
    aiComment: document.getElementById("aiComment"),
    studyTips: document.getElementById("studyTips"),
    btnRestart: document.getElementById("btnRestart"),
    studentName: document.getElementById("studentName"),
    className: document.getElementById("className"),
    btnSubmitReport: document.getElementById("btnSubmitReport"),
    reportHint: document.getElementById("reportHint"),
  };

  let questions = [];
  let currentIndex = 0;
  let firstAttemptCorrect = [];
  let everWrongOnQuestion = [];
  /** @type {Record<string, number>} */
  let knowledgeErrorCount = {};
  let totalWrongAttempts = 0;
  let awaitingCorrect = false;

  const KNOWLEDGE_ADVICE = {
    神经元: {
      focus: "神经系统的基本单位",
      tip: "绘制「神经元结构示意图」，标注树突、轴突、细胞体，并写出各自功能；对比神经元与神经、效应器的区别。",
    },
    中枢神经系统: {
      focus: "中枢与外周神经系统的层级划分",
      tip: "用思维导图梳理：中枢神经系统（脑+脊髓）→ 外周神经系统（脑神经+脊神经）→ 自主神经；避免将功能分类与结构分类混用。",
    },
    外周神经系统: {
      focus: "神经系统结构层级",
      tip: "对照教材结构图，默写中枢与外周各自包含的结构；注意区分「神经系统组成」与「反射弧组成」。",
    },
    "树突的功能": {
      focus: "神经元结构与功能对应",
      tip: "列表对比树突与轴突的结构特点与功能，牢记「树突接受、轴突传出」口诀。",
    },
    "轴突的功能": {
      focus: "神经元结构与功能对应",
      tip: "结合结构与功能相适应原则，分析轴突细长结构如何利于远距离传信息。",
    },
    自主神经调节: {
      focus: "交感神经与副交感神经的拮抗作用",
      tip: "制作对照表：交感（应激、心跳加快）vs 副交感（休息、心跳减慢），联系考试紧张等生活实例。",
    },
    条件反射: {
      focus: "条件反射与非条件反射的区分",
      tip: "各举 3 个先天反射与后天条件反射实例，明确后者需大脑皮层参与、需学习形成。",
    },
    反射弧: {
      focus: "反射弧五环节顺序",
      tip: "按「感受器→传入→中枢→传出→效应器」顺序默写，并标出兴奋传导方向；可配合缩手反射实例理解。",
    },
    反射: {
      focus: "反射的定义与条件",
      tip: "牢记反射三要素：有神经系统、完整反射弧、规律性反应；区分植物应激性与动物反射。",
    },
    反射过程: {
      focus: "反射发生的时间顺序",
      tip: "梳理「刺激→感受器兴奋→传入→中枢→传出→效应器反应→感觉形成」的先后，感受器兴奋始终是最先环节。",
    },
  };

  function showScreen(name) {
    els.screenLoading.hidden = name !== "loading";
    els.screenQuiz.hidden = name !== "quiz";
    els.screenResult.hidden = name !== "result";
  }

  function parseAnswerLetter(answer) {
    if (answer == null) return "";
    const m = String(answer).trim().toUpperCase().match(/^[A-Z]/);
    return m ? m[0] : "";
  }

  function getOptionLetters(q) {
    if (!q.options || typeof q.options !== "object") return [];
    return Object.keys(q.options)
      .filter(function (k) {
        return /^[A-Z]$/i.test(k);
      })
      .sort();
  }

  function validateQuestion(q, index) {
    if (!q.question || !q.answer || !q.knowledge) {
      throw new Error("第 " + (index + 1) + " 题缺少必要字段");
    }
    const letters = getOptionLetters(q);
    if (letters.length < 2) {
      throw new Error("第 " + (index + 1) + " 题选项格式无效");
    }
    const ans = parseAnswerLetter(q.answer);
    if (!letters.includes(ans)) {
      throw new Error("第 " + (index + 1) + " 题答案不在选项中");
    }
  }

  function loadQuestions() {
    return fetch("questionBank.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("无法读取 questionBank.json（HTTP " + res.status + "）");
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("题库为空或格式不是数组");
        }
        data.forEach(validateQuestion);
        return data;
      });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clearFeedback() {
    els.feedbackZone.hidden = true;
    els.feedbackStatus.classList.remove("feedback--ok", "feedback--bad");
    els.aiFeedback.hidden = true;
    els.feedbackCards.innerHTML = "";
  }

  function renderQuestion() {
    const q = questions[currentIndex];
    const total = questions.length;
    const n = currentIndex + 1;

    els.progressText.textContent = n + " / " + total;
    const pct = Math.round((n / total) * 100);
    els.progressFill.style.width = pct + "%";
    els.progressFill.parentElement.setAttribute("aria-valuenow", String(pct));

    els.knowledgeTag.textContent = q.knowledge || "知识点";
    els.questionIndex.textContent = "Q" + String(n).padStart(2, "0") + " · NEURAL MODULE";
    els.questionText.textContent = q.question;

    clearFeedback();
    els.btnSubmit.disabled = true;

    els.optionsList.innerHTML = "";
    getOptionLetters(q).forEach(function (letter) {
      const text = q.options[letter];
      const li = document.createElement("li");
      li.className = "option";
      li.setAttribute("role", "radio");
      li.setAttribute("aria-checked", "false");
      li.dataset.letter = letter;
      li.innerHTML =
        '<span class="option__key" aria-hidden="true">' +
        letter +
        '</span><span class="option__text">' +
        escapeHtml(text) +
        "</span>";
      li.addEventListener("click", function () {
        if (li.classList.contains("option--locked")) return;
        selectOption(li);
      });
      els.optionsList.appendChild(li);
    });
  }

  function getSelectedLi() {
    return els.optionsList.querySelector(".option--selected");
  }

  function selectOption(li) {
    els.optionsList.querySelectorAll(".option").forEach(function (el) {
      el.classList.remove("option--selected", "option--wrong");
      el.setAttribute("aria-checked", "false");
    });
    li.classList.add("option--selected");
    li.setAttribute("aria-checked", "true");
    els.btnSubmit.disabled = false;
  }

  function lockOptions(lock) {
    els.optionsList.querySelectorAll(".option").forEach(function (el) {
      el.classList.toggle("option--locked", lock);
    });
  }

  function buildFeedbackCard(type, label, icon, body) {
    const card = document.createElement("div");
    card.className = "fb-card fb-card--" + type;
    card.innerHTML =
      '<p class="fb-card__label">' +
      icon +
      " " +
      escapeHtml(label) +
      '</p><p class="fb-card__body">' +
      escapeHtml(body) +
      "</p>";
    return card;
  }

  function showOptionFeedback(q, chosenLetter) {
    const fb = (q.feedback && q.feedback[chosenLetter]) || null;
    els.aiFeedback.hidden = false;
    els.wrongOptionLabel.textContent = "你选择了选项 " + chosenLetter;
    els.feedbackCards.innerHTML = "";

    if (fb) {
      els.feedbackCards.appendChild(
        buildFeedbackCard("analysis", "错误原因分析", "①", fb.errorAnalysis || "")
      );
      els.feedbackCards.appendChild(
        buildFeedbackCard("tip", "知识提示", "②", fb.knowledgeTip || "")
      );
      els.feedbackCards.appendChild(
        buildFeedbackCard("guide", "思维引导", "③", fb.thinkingGuide || "")
      );
    } else {
      const fallback = document.createElement("div");
      fallback.className = "fb-card fb-card--tip";
      fallback.innerHTML =
        '<p class="fb-card__body">暂无该选项的专属反馈，请结合教材重新审题后作答。</p>';
      els.feedbackCards.appendChild(fallback);
    }
  }

  function recordKnowledgeError(knowledge) {
    if (!knowledge) return;
    knowledgeErrorCount[knowledge] = (knowledgeErrorCount[knowledge] || 0) + 1;
  }

  function goNextOrFinish() {
    if (currentIndex >= questions.length - 1) {
      showResults();
      return;
    }
    currentIndex += 1;
    renderQuestion();
  }

  function getWeakSorted() {
    return Object.keys(knowledgeErrorCount)
      .map(function (k) {
        return [k, knowledgeErrorCount[k]];
      })
      .sort(function (a, b) {
        return b[1] - a[1];
      });
  }

  /** 收集曾答错题目的序号与题干 */
  function collectWrongQuestionLines() {
    const lines = [];
    for (let i = 0; i < questions.length; i++) {
      if (!everWrongOnQuestion[i]) continue;
      const q = questions[i];
      const num = q.id != null ? q.id : i + 1;
      lines.push("第" + num + "题：" + (q.question || "").trim());
    }
    return lines;
  }

  /** 未掌握知识点：去重、保序 */
  function collectWeakKnowledgeList() {
    const seen = {};
    const list = [];
    for (let i = 0; i < questions.length; i++) {
      if (!everWrongOnQuestion[i]) continue;
      const k = questions[i].knowledge;
      if (!k || seen[k]) continue;
      seen[k] = true;
      list.push(k);
    }
    return list;
  }

  function formatWrongQuestionsText(lines) {
    if (!lines.length) return "无";
    return lines.join("\n");
  }

  function formatWeakKnowledgeText(list) {
    if (!list.length) return "无";
    return list.join("、");
  }

  /**
   * 动态生成教师风格 AI 评语（纯文本，用于问卷与 teacherData）
   */
  function generateTeacherCommentPlain(stats) {
    const pct = stats.accuracyPct;
    const wrongQCount = stats.wrongQuestionCount;
    const weakCount = stats.weakKnowledgeList.length;
    const weakSorted = stats.weakSorted;
    const total = stats.total;
    const firstOk = stats.firstOk;
    const wrongTimes = stats.wrongTimes;

    const parts = [];

    parts.push(
      "你已完成本次「神经调节」智能闯关（共 " +
        total +
        " 题，首次作答正确率 " +
        pct +
        "%）。"
    );

    if (pct >= 90) {
      parts.push(
        "你对神经调节基础知识掌握扎实，已经具备较好的知识网络结构，能够较准确地区分核心概念。"
      );
    } else if (pct >= 60) {
      parts.push(
        "你已基本掌握核心知识，但部分概念之间仍存在混淆，需要进一步强化理解与辨析能力。"
      );
    } else {
      parts.push(
        "当前对神经调节知识的理解仍不稳定，建议重新梳理反射弧与神经系统结构等核心内容，夯实基础后再推进拓展学习。"
      );
    }

    if (wrongQCount === 0) {
      parts.push(
        "本次闯关各题首次作答均正确，说明课前预习效果良好，请继续保持并尝试向同学讲解重点，以教促学。"
      );
    } else {
      parts.push(
        "本次共有 " +
          wrongQCount +
          " 道题在作答过程中出现过错误（累计错选 " +
          wrongTimes +
          " 次），涉及 " +
          weakCount +
          " 个知识模块，建议结合系统给出的选项级反馈逐题订正。"
      );

      if (weakCount > 0) {
        const names = stats.weakKnowledgeList.join("、");
        parts.push("需重点巩固的知识点包括：" + names + "。");

        const top = weakSorted[0] ? weakSorted[0][0] : "";
        if (top === "反射弧" || top === "反射过程" || top === "反射") {
          parts.push(
            "其中反射相关内容的错误较为突出，请重点理清反射弧五环节顺序及兴奋传导的时间先后，避免将感觉形成与反射起点混为一谈。"
          );
        } else if (top === "中枢神经系统" || top === "外周神经系统") {
          parts.push(
            "神经系统结构层级是你目前的薄弱方向，建议对照结构图区分中枢（脑、脊髓）与外周（脑神经、脊神经），不要混淆结构分类与功能分类。"
          );
        } else if (
          top === "神经元" ||
          top === "树突的功能" ||
          top === "轴突的功能"
        ) {
          parts.push(
            "神经元结构与功能对应仍需加强，牢记「树突接受、轴突传出、神经元是基本单位」等核心结论。"
          );
        } else if (top === "自主神经调节") {
          parts.push(
            "自主神经调节部分可结合生活实例理解交感神经与副交感神经的拮抗作用，尤其注意紧张状态下心跳加快的调节机制。"
          );
        }
      }
    }

    if (pct >= 90 && wrongQCount > 0) {
      parts.push(
        "整体水平较高，针对少量疏漏精练即可；建议将本次错题整理进错题本，周末回顾一次。"
      );
    } else if (pct >= 60 && pct < 90) {
      parts.push(
        "你已经走在正确的学习轨道上，只要针对薄弱模块专项突破，正确率会有明显提升。加油，坚持订正！"
      );
    } else if (pct < 60) {
      parts.push(
        "不要气馁，神经调节是整章的重点与难点。建议先通读教材相关小节，再使用本系统重新闯关，关注首次作答正确率的变化。"
      );
    } else if (pct >= 90 && wrongQCount === 0) {
      parts.push("期待你在课堂上主动分享学习心得，帮助同学共同进步。");
    }

    return parts.join("\n");
  }

  function plainCommentToHtml(text) {
    return text
      .split("\n")
      .filter(Boolean)
      .map(function (para) {
        return "<p>" + escapeHtml(para) + "</p>";
      })
      .join("");
  }

  function generateStudyTips(weakSorted) {
    const tips = [];

    if (weakSorted.length === 0) {
      tips.push("保持当前学习节奏，可尝试拓展兴奋的产生与传导等后续内容。");
      tips.push("建议向同学讲解神经系统结构图，以教促学巩固理解。");
      return tips;
    }

    weakSorted.forEach(function (item) {
      const name = item[0];
      const advice = KNOWLEDGE_ADVICE[name];
      if (advice) {
        tips.push("【" + name + "】" + advice.tip);
      } else {
        tips.push("【" + name + "】回顾教材对应小节，整理错题并写出正确思路。");
      }
    });

    tips.push("完成订正后点击「重新闯关」，关注首次作答正确率是否提升。");
    tips.push("建议使用思维导图将「神经系统组成—神经元—反射弧—反射类型」串联成知识网络。");

    return tips;
  }

  function buildSessionSnapshot() {
    const total = questions.length;
    let firstOk = 0;
    for (let i = 0; i < total; i++) {
      if (firstAttemptCorrect[i]) firstOk += 1;
    }
    const accuracyPct = total ? Math.round((firstOk / total) * 1000) / 10 : 0;
    const wrongQuestionLines = collectWrongQuestionLines();
    const weakKnowledgeList = collectWeakKnowledgeList();
    const weakSorted = getWeakSorted();

    let wrongQuestionCount = 0;
    for (let i = 0; i < total; i++) {
      if (everWrongOnQuestion[i]) wrongQuestionCount += 1;
    }

    const stats = {
      firstOk: firstOk,
      total: total,
      accuracyPct: accuracyPct,
      wrongQuestionCount: wrongQuestionCount,
      wrongTimes: totalWrongAttempts,
      wrongQuestionLines: wrongQuestionLines,
      weakKnowledgeList: weakKnowledgeList,
      weakSorted: weakSorted,
    };

    const aiCommentPlain = generateTeacherCommentPlain(stats);

    return {
      stats: stats,
      accuracyDisplay: accuracyPct + "%",
      wrongQuestionsText: formatWrongQuestionsText(wrongQuestionLines),
      weakKnowledgeText: formatWeakKnowledgeText(weakKnowledgeList),
      aiCommentPlain: aiCommentPlain,
      aiCommentHtml: plainCommentToHtml(aiCommentPlain),
    };
  }

  /** 将闯关结果同步至 teacherData（姓名、班级由表单填写） */
  function syncTeacherData() {
    if (!sessionSnapshot) {
      sessionSnapshot = buildSessionSnapshot();
    }
    teacherData.accuracy = sessionSnapshot.accuracyDisplay;
    teacherData.wrongQuestions = sessionSnapshot.wrongQuestionsText;
    teacherData.weakKnowledge = sessionSnapshot.weakKnowledgeText;
    teacherData.aiComment = sessionSnapshot.aiCommentPlain;
    if (els.studentName) {
      teacherData.studentName = els.studentName.value.trim();
    }
    if (els.className) {
      teacherData.className = els.className.value.trim();
    }
    return teacherData;
  }

  function buildTencentFormUrl(data) {
    const base = TENCENT_FORM_URL.replace(/\?$/, "");
    const sep = base.indexOf("?") >= 0 ? "&" : "?";
    const fields = {
      q1: data.studentName || "",
      q2: data.className || "",
      q3: data.accuracy || "",
      q4: data.wrongQuestions || "",
      q5: data.weakKnowledge || "",
      q6: data.aiComment || "",
    };
    const pairs = Object.keys(fields).map(function (key) {
      return key + "=" + encodeURIComponent(fields[key]);
    });
    return base + sep + pairs.join("&");
  }

  function showReportHint(message, isOk) {
    if (!els.reportHint) return;
    els.reportHint.hidden = false;
    els.reportHint.textContent = message;
    els.reportHint.classList.toggle("report-hint--ok", !!isOk);
  }

  function hideReportHint() {
    if (!els.reportHint) return;
    els.reportHint.hidden = true;
    els.reportHint.classList.remove("report-hint--ok");
  }

  function submitLearningReport() {
    hideReportHint();

    const name = els.studentName ? els.studentName.value.trim() : "";
    const cls = els.className ? els.className.value.trim() : "";

    if (els.studentName) {
      els.studentName.classList.toggle("form-input--error", !name);
    }
    if (els.className) {
      els.className.classList.toggle("form-input--error", !cls);
    }

    if (!name || !cls) {
      showReportHint("请先填写学生姓名和班级后再提交。", false);
      return;
    }

    const data = syncTeacherData();
    if (data.studentName) {
      data.aiComment = data.studentName + "同学，" + data.aiComment;
    }
    const url = buildTencentFormUrl(data);

    try {
      localStorage.setItem(
        "neuralReportDraft",
        JSON.stringify({
          studentName: data.studentName,
          className: data.className,
        })
      );
    } catch (e) {
      /* 忽略本地存储不可用 */
    }

    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      window.location.href = url;
    }

    showReportHint("学习报告已生成，正在打开腾讯问卷页面；若未自动跳转请允许浏览器弹窗。", true);
  }

  function restoreReportDraft() {
    try {
      const raw = localStorage.getItem("neuralReportDraft");
      if (!raw || !els.studentName || !els.className) return;
      const draft = JSON.parse(raw);
      if (draft.studentName) els.studentName.value = draft.studentName;
      if (draft.className) els.className.value = draft.className;
    } catch (e) {
      /* 忽略 */
    }
  }

  function showResults() {
    showScreen("result");
    sessionSnapshot = buildSessionSnapshot();
    const stats = sessionSnapshot.stats;

    els.statAccuracy.textContent = sessionSnapshot.accuracyDisplay;
    els.statFirstCorrect.textContent = stats.firstOk + " / " + stats.total;
    els.statTotal.textContent = String(stats.total);
    els.statErrors.textContent = String(stats.wrongTimes);

    if (els.statRing) {
      els.statRing.style.transform = "rotate(" + (stats.accuracyPct * 3.6 - 45) + "deg)";
    }

    const weakSorted = stats.weakSorted;

    els.weakKnowledge.innerHTML = "";
    if (weakSorted.length === 0) {
      const li = document.createElement("li");
      li.textContent = "无薄弱项 — 各知识点掌握良好";
      els.weakKnowledge.appendChild(li);
      els.weakKnowledge.classList.add("tag-list--empty");
    } else {
      els.weakKnowledge.classList.remove("tag-list--empty");
      weakSorted.forEach(function (item) {
        const li = document.createElement("li");
        li.innerHTML = escapeHtml(item[0]) + '<span class="tag-count">×' + item[1] + "</span>";
        els.weakKnowledge.appendChild(li);
      });
    }

    els.aiComment.innerHTML = sessionSnapshot.aiCommentHtml;

    els.studyTips.innerHTML = "";
    generateStudyTips(weakSorted).forEach(function (tip) {
      const li = document.createElement("li");
      li.textContent = tip;
      els.studyTips.appendChild(li);
    });

    syncTeacherData();
    restoreReportDraft();
    hideReportHint();
  }

  function onSubmit() {
    const q = questions[currentIndex];
    const correctLetter = parseAnswerLetter(q.answer);
    const selected = getSelectedLi();
    if (!selected) return;

    const chosen = selected.dataset.letter || "";

    if (chosen === correctLetter) {
      if (!awaitingCorrect) {
        firstAttemptCorrect[currentIndex] = true;
      }
      els.feedbackZone.hidden = false;
      els.feedbackStatus.classList.remove("feedback--bad");
      els.feedbackStatus.classList.add("feedback--ok");
      els.feedbackTitle.textContent = "回答正确 · 即将进入下一题";
      els.aiFeedback.hidden = true;
      lockOptions(true);
      selected.classList.add("option--correct");
      els.btnSubmit.disabled = true;

      window.setTimeout(function () {
        awaitingCorrect = false;
        goNextOrFinish();
      }, 750);
      return;
    }

    everWrongOnQuestion[currentIndex] = true;
    totalWrongAttempts += 1;
    recordKnowledgeError(q.knowledge);

    if (!awaitingCorrect) {
      firstAttemptCorrect[currentIndex] = false;
    }
    awaitingCorrect = true;

    els.feedbackZone.hidden = false;
    els.feedbackStatus.classList.remove("feedback--ok");
    els.feedbackStatus.classList.add("feedback--bad");
    els.feedbackTitle.textContent = "回答错误 · 请阅读 AI 形成性反馈后重新作答";
    showOptionFeedback(q, chosen);

    selected.classList.add("option--wrong");
    lockOptions(false);
    els.optionsList.querySelectorAll(".option").forEach(function (el) {
      el.classList.remove("option--selected");
      el.setAttribute("aria-checked", "false");
    });
    els.btnSubmit.disabled = true;
  }

  function startQuiz() {
    currentIndex = 0;
    firstAttemptCorrect = questions.map(function () {
      return false;
    });
    everWrongOnQuestion = questions.map(function () {
      return false;
    });
    knowledgeErrorCount = {};
    totalWrongAttempts = 0;
    awaitingCorrect = false;
    sessionSnapshot = null;
    hideReportHint();
    showScreen("quiz");
    renderQuestion();
  }

  els.btnSubmit.addEventListener("click", onSubmit);
  els.btnRestart.addEventListener("click", startQuiz);

  if (els.btnSubmitReport) {
    els.btnSubmitReport.addEventListener("click", submitLearningReport);
  }

  if (els.studentName) {
    els.studentName.addEventListener("input", function () {
      els.studentName.classList.remove("form-input--error");
    });
  }
  if (els.className) {
    els.className.addEventListener("input", function () {
      els.className.classList.remove("form-input--error");
    });
  }

  els.headerMeta.textContent = "AI FORMATIVE · v3";

  /** 供教师端或控制台调试读取 */
  window.getTeacherData = function () {
    return syncTeacherData();
  };

  loadQuestions()
    .then(function (data) {
      questions = data;
      startQuiz();
    })
    .catch(function (err) {
      showScreen("loading");
      els.loadError.hidden = false;
      els.loadError.textContent =
        (err && err.message ? err.message : "加载失败") +
        "。若直接双击打开 HTML，部分浏览器会禁止读取本地 JSON；请使用 VS Code Live Server，" +
        "或在本目录执行：python -m http.server 8000，然后访问 http://localhost:8000/";
    });
})();
