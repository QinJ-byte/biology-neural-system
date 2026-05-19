(function () {
  "use strict";

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

  function generateAIComment(firstOk, total, weakSorted) {
    const pct = total ? Math.round((firstOk / total) * 100) : 0;
    const parts = [];

    parts.push(
      '<p>同学你好，本次<strong>神经调节</strong>智能闯关共完成 <strong>' +
        total +
        "</strong> 题，首次作答正确率为 <strong>" +
        pct +
        "%</strong>（" +
        firstOk +
        "/" +
        total +
        "）。</p>"
    );

    if (weakSorted.length === 0) {
      parts.push(
        "<p>你在各知识模块的首次作答表现优秀，对神经系统结构、反射与神经调节等核心概念掌握扎实，已形成良好的知识网络。</p>"
      );
      return parts.join("");
    }

    const top = weakSorted[0];
    const topName = top[0];
    const topCount = top[1];

    parts.push(
      "<p>从形成性评价角度看，你在闯关过程中对以下模块需要加强：<strong>" +
        weakSorted
          .map(function (item) {
            return item[0] + "（错 " + item[1] + " 次）";
          })
          .join("、") +
        "</strong>。</p>"
    );

    if (topName === "反射弧" || topName === "反射过程" || topName === "反射") {
      parts.push(
        "<p>其中 <strong>" +
          topName +
          "</strong> 相关题目错误 " +
          topCount +
          " 次，说明你对<strong>反射弧结构顺序</strong>或<strong>反射发生过程</strong>仍存在混淆。建议重点梳理「感受器→传入→中枢→传出→效应器」的传导逻辑，并区分反射起点与感觉形成的时间先后。</p>"
      );
    } else if (topName === "中枢神经系统" || topName === "外周神经系统") {
      parts.push(
        "<p>你在 <strong>" +
          topName +
          "</strong> 上错误较多，反映出对<strong>神经系统结构层级</strong>的划分仍不够清晰。建议用结构图区分「中枢（脑+脊髓）」与「外周（脑神经+脊神经）」，避免将功能分类与结构分类混为一谈。</p>"
      );
    } else if (topName === "树突的功能" || topName === "轴突的功能" || topName === "神经元") {
      parts.push(
        "<p>你在 <strong>" +
          topName +
          "</strong> 方面存在薄弱，可能与<strong>神经元结构与功能对应</strong>或<strong>基本单位概念</strong>有关。建议对照神经元模式图，强化「树突接受、轴突传出、神经元是基本单位」等核心结论。</p>"
      );
    } else {
      const advice = KNOWLEDGE_ADVICE[topName];
      parts.push(
        "<p>你在 <strong>" +
          topName +
          "</strong> 模块错误较为集中（" +
          topCount +
          " 次）。" +
          (advice ? "主要问题可能集中在「" + advice.focus + "」。" : "") +
          " 请结合 AI 形成性反馈中的错因分析，有针对性地回顾教材相关段落。</p>"
      );
    }

    if (pct >= 80) {
      parts.push("<p>整体基础较好，针对薄弱点精练后即可进入下一阶段学习。</p>");
    } else if (pct >= 60) {
      parts.push("<p>你已具备一定基础，建议针对薄弱模块进行专项巩固后再闯关一次。</p>");
    } else {
      parts.push(
        "<p>建议先系统复习「神经系统的组成与功能」整节内容，再借助本系统的选项级反馈逐题订正，夯实概念后再挑战闯关。</p>"
      );
    }

    return parts.join("");
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

  function showResults() {
    showScreen("result");
    const total = questions.length;
    let firstOk = 0;
    for (let i = 0; i < total; i++) {
      if (firstAttemptCorrect[i]) firstOk += 1;
    }
    const pct = total ? Math.round((firstOk / total) * 1000) / 10 : 0;

    els.statAccuracy.textContent = pct + "%";
    els.statFirstCorrect.textContent = firstOk + " / " + total;
    els.statTotal.textContent = String(total);
    els.statErrors.textContent = String(totalWrongAttempts);

    if (els.statRing) {
      els.statRing.style.transform = "rotate(" + (pct * 3.6 - 45) + "deg)";
    }

    const weakSorted = Object.keys(knowledgeErrorCount)
      .map(function (k) {
        return [k, knowledgeErrorCount[k]];
      })
      .sort(function (a, b) {
        return b[1] - a[1];
      });

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

    els.aiComment.innerHTML = generateAIComment(firstOk, total, weakSorted);

    els.studyTips.innerHTML = "";
    generateStudyTips(weakSorted).forEach(function (tip) {
      const li = document.createElement("li");
      li.textContent = tip;
      els.studyTips.appendChild(li);
    });
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
    showScreen("quiz");
    renderQuestion();
  }

  els.btnSubmit.addEventListener("click", onSubmit);
  els.btnRestart.addEventListener("click", startQuiz);
  els.headerMeta.textContent = "AI FORMATIVE · v2";

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
